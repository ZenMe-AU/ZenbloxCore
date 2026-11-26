/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAzureAccessFailureKind, type AzureAccessFailureKind } from "../../logic/azureAccessFailure";
import { formatAzureAccessError } from "../../api/azureArm";
import { ensureEntraActions } from "../../api/azureGraph";
import { ensureScopeConsent } from "../../auth/msal";
import { scopeResource } from "../../logic/consent";
import { MissingAccessError } from "../../logic/azureAccess";
import { ROLE_READ_SCOPES } from "../../config/azureConfig";
import { ensureCardResourceAccess, type CardAccessGaps, type SubscriptionAccess } from "./useAzureAccessCheck";
import { useProviderRegistration } from "./useProviderRegistration";
import type { AzureTarget, CardResourceAccessRequest } from "../../types";

function formatGraphAccessError(error: unknown): string {
  const details = error instanceof Error ? error.message : String(error);
  if (!/\b403\b|Authorization_RequestDenied|Insufficient privileges/i.test(details)) return details;
  return `Microsoft Graph denied service-principal access. This card needs the Application.ReadWrite.All delegated permission with admin consent and a supported Microsoft Entra role, such as Application Administrator or Cloud Application Administrator. For a single-tenant app you own, Application Developer may apply. Ask your tenant administrator to grant or activate access, then recheck. Details: ${details}`;
}

export function formatCardResourceAccessError(error: unknown): string {
  const details = error instanceof Error ? error.message : String(error);
  return /servicePrincipals|Authorization_RequestDenied/i.test(details)
    ? formatGraphAccessError(error)
    : formatAzureAccessError(error);
}

// The check itself couldn't run (a failed call, sign-in, network), as opposed to finding something missing.
function formatCheckError(error: unknown): string {
  return `The Azure access check couldn't run. Recheck, or sign in again if it keeps failing.\n\n${formatCardResourceAccessError(error)}`;
}

type Gaps = CardAccessGaps & { missingEntra: string | null };

// Every gap as one message, for a blocked run to report.
function gapsMessage({ missingRoles, missingEntra, unregisteredProviders, missingConsent }: Gaps): string {
  return [
    missingRoles,
    missingEntra,
    unregisteredProviders.length ? `These Azure resource providers aren't registered in this subscription yet: ${unregisteredProviders.join(", ")}` : "",
    missingConsent.length ? `This card needs your consent for: ${missingConsent.join(", ")}` : "",
  ].filter(Boolean).join("\n\n");
}

// Shared by every card that checks the same access on the same target, whichever card asks.
function accessKey(homeAccountId: string | undefined, accountTenantId: string | undefined, tenantId: string | undefined, subscriptionId: string, requestKey: string) {
  return ["azure-resource-access", homeAccountId, accountTenantId, tenantId, subscriptionId, requestKey] as const;
}

// pre-flight warning panel for Azure resource permissions; card-specific checks (data plane, Graph) are called by the card when it chooses
export function useCardResourceAccessV2(target: AzureTarget, request: CardResourceAccessRequest) {
  const { azureAccount, subscriptionId, tenantId } = target;
  const homeAccountId = azureAccount?.homeAccountId;
  const accountTenantId = azureAccount?.tenantId;
  const requestKey = JSON.stringify(request);
  // All four kinds run to the end so every gap shows at once; only a check that can't run throws.
  const findGaps = useCallback(async (account: NonNullable<AzureTarget["azureAccount"]>, subscription: string, tenant?: string): Promise<Gaps> => {
    const request = JSON.parse(requestKey) as CardResourceAccessRequest;
    const found = await ensureCardResourceAccess(account, subscription, request, tenant);
    const missingEntra = request.entraRoles.length
      ? await ensureEntraActions(account, request.entraRoles, tenant).then(() => null, (err: unknown) => {
        if (err instanceof MissingAccessError) return err.message;
        throw err;
      })
      : null;
    return { missingRoles: found?.missingRoles ?? null, missingEntra, unregisteredProviders: found?.unregisteredProviders ?? [], missingConsent: found?.missingConsent ?? [] };
  }, [requestKey]);

  const enabled = !!azureAccount && !!subscriptionId;
  const client = useQueryClient();
  // Checked again only on Recheck, before a run, or for another target: not on every window focus or remount.
  const query = useQuery({
    queryKey: accessKey(homeAccountId, accountTenantId, tenantId, subscriptionId, requestKey),
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: () => findGaps(azureAccount!, subscriptionId, tenantId),
  });
  const access: SubscriptionAccess = {
    status: !enabled ? "idle" : query.isFetching || query.isPending ? "checking" : query.isError ? "error" : "ready",
    error: query.isError ? formatCheckError(query.error) : null,
    failureKind: query.isError ? getAzureAccessFailureKind(query.error) : null,
    retry: () => { if (enabled) void query.refetch(); },
  };
  // A check before a run replaces what the query found, so the card shows the latest gaps.
  const publish = useCallback(async (gaps: Gaps) => {
    const key = accessKey(homeAccountId, accountTenantId, tenantId, subscriptionId, requestKey);
    await client.cancelQueries({ queryKey: key, exact: true });
    client.setQueryData(key, gaps);
  }, [client, homeAccountId, accountTenantId, tenantId, subscriptionId, requestKey]);

  const [failure, setFailure] = useState<{
    account: typeof azureAccount; subscriptionId: string; tenantId: string | undefined;
    findGaps: typeof findGaps; message: string; failureKind: AzureAccessFailureKind;
  } | null>(null);
  // Cards report a call Azure denied during a run; the check reports its own failure with formatCheckError.
  const reportFailure = useCallback((error: unknown, format = formatCardResourceAccessError) => {
    setFailure({
      account: azureAccount, subscriptionId, tenantId, findGaps,
      failureKind: getAzureAccessFailureKind(error),
      message: format(error),
    });
  }, [azureAccount, subscriptionId, tenantId, findGaps]);
  // Before a run: a check that can't run is an error; a gap stays a warning on the card, but the run still stops.
  const check = useCallback(async () => {
    if (!azureAccount || !subscriptionId) throw new Error("Select an Azure account and subscription before checking resource access.");
    const found = await findGaps(azureAccount, subscriptionId, tenantId).catch((error: unknown) => {
      reportFailure(error, formatCheckError);
      throw new Error(formatCheckError(error), { cause: error });
    });
    await publish(found);
    setFailure(null);
    const message = gapsMessage(found);
    if (message) throw new Error(message);
  }, [azureAccount, subscriptionId, tenantId, findGaps, publish, reportFailure]);
  const currentFailure = failure?.account === azureAccount && failure?.subscriptionId === subscriptionId &&
    failure?.tenantId === tenantId && failure?.findGaps === findGaps ? failure.message : null;
  const rerun = () => {
    setFailure(null);
    access.retry();
  };
  // Only from the check that just ran, so a stale list never lingers.
  const current = access.status === "ready" && !currentFailure ? query.data ?? null : null;
  const missingRoles = current?.missingRoles ?? null;
  const missingEntra = current?.missingEntra ?? null;
  const unregisteredProviders = current?.unregisteredProviders ?? [];
  const missingConsent = current?.missingConsent ?? [];
  const { ensureRegistered } = useProviderRegistration(target);
  const [registeringProviders, setRegisteringProviders] = useState(false);
  // A click: registering is an Azure write, so it never runs on its own.
  const registerProviders = async () => {
    setRegisteringProviders(true);
    try {
      await ensureRegistered(unregisteredProviders);
      rerun();
    } catch (error) {
      reportFailure(error);
    } finally {
      setRegisteringProviders(false);
    }
  };
  // A click that redirects to the consent prompt for one resource's scopes; the check reruns on the way back.
  const grantConsent = () => {
    if (!azureAccount || !missingConsent.length) return;
    const scopes = missingConsent.filter((scope) => scopeResource(scope) === scopeResource(missingConsent[0]));
    void ensureScopeConsent(azureAccount, scopes, tenantId).then((redirecting) => redirecting || rerun(), reportFailure);
  };
  // Recheck is a click, so it may redirect to grant the Entra role read scope; the automatic check stays silent.
  const retry = () => {
    if (!request.entraRoles.length || !azureAccount) return rerun();
    void ensureScopeConsent(azureAccount, ROLE_READ_SCOPES, tenantId).then((redirecting) => redirecting || rerun(), reportFailure);
  };
  const warning = current ? gapsMessage(current) : "";
  return {
    ...access,
    // A gap is a warning: the card stays blocked until it's fixed, but nothing failed. A check that couldn't run is an error.
    ...(currentFailure ? { status: "error" as const, error: currentFailure } : warning ? { status: "warning" as const, error: warning } : {}),
    retry,
    check,
    reportFailure,
    missingRoles,
    missingEntra,
    unregisteredProviders,
    registeringProviders,
    registerProviders,
    missingConsent,
    grantConsent,
  };
}

export type CardResourceAccessV2 = ReturnType<typeof useCardResourceAccessV2>;
