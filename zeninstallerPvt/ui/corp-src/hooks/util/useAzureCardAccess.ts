/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useState } from "react";
import { getAzureAccessFailureKind, type AzureAccessFailureKind } from "../../logic/azureAccessFailure";
import { formatAzureAccessError } from "../../api/azureArm";
import { ensureEntraActions } from "../../api/azureGraph";
import { ensureScopeConsent } from "../../auth/msal";
import { scopeResource } from "../../logic/consent";
import { MissingAccessError } from "../../logic/azureAccess";
import { ROLE_READ_SCOPES } from "../../config/azureConfig";
import { ensureCardResourceAccess, useSubscriptionAccess, type CardAccessGaps } from "./useAzureAccessCheck";
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

// pre-flight warning panel for Azure resource permissions; card-specific checks (data plane, Graph) are called by the card when it chooses
export function useCardResourceAccess(target: AzureTarget, request: CardResourceAccessRequest) {
  const { azureAccount, subscriptionId, tenantId } = target;
  const requestKey = JSON.stringify(request);
  // What the last check found missing, keyed so it never shows for another account, subscription or request.
  const [gaps, setGaps] = useState<Gaps & { key: string } | null>(null);
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
    const result = { missingRoles: found?.missingRoles ?? null, missingEntra, unregisteredProviders: found?.unregisteredProviders ?? [], missingConsent: found?.missingConsent ?? [] };
    setGaps({ ...result, key: `${account.homeAccountId}|${subscription}|${tenant}|${requestKey}` });
    return result;
  }, [requestKey]);
  const checkAccess = useCallback(async (account: NonNullable<AzureTarget["azureAccount"]>, subscription: string, tenant?: string) => {
    await findGaps(account, subscription, tenant);
  }, [findGaps]);
  const access = useSubscriptionAccess(target, checkAccess, formatCheckError);
  const [failure, setFailure] = useState<{
    account: typeof azureAccount; subscriptionId: string; tenantId: string | undefined;
    checkAccess: typeof checkAccess; message: string; failureKind: AzureAccessFailureKind;
  } | null>(null);
  // Cards report a call Azure denied during a run; the check reports its own failure with formatCheckError.
  const reportFailure = useCallback((error: unknown, format = formatCardResourceAccessError) => {
    setFailure({
      account: azureAccount, subscriptionId, tenantId, checkAccess,
      failureKind: getAzureAccessFailureKind(error), // TODO: checking
      message: format(error),
    });
  }, [azureAccount, subscriptionId, tenantId, checkAccess]);
  // Before a run: a check that can't run is an error; a gap stays a warning on the card, but the run still stops.
  const check = useCallback(async () => {
    if (!azureAccount || !subscriptionId) throw new Error("Select an Azure account and subscription before checking resource access.");
    const found = await findGaps(azureAccount, subscriptionId, tenantId).catch((error: unknown) => {
      reportFailure(error, formatCheckError);
      throw new Error(formatCheckError(error), { cause: error });
    });
    setFailure(null);
    const message = gapsMessage(found);
    if (message) throw new Error(message);
  }, [azureAccount, subscriptionId, tenantId, findGaps, reportFailure]);
  const currentFailure = failure?.account === azureAccount && failure?.subscriptionId === subscriptionId &&
    failure?.tenantId === tenantId && failure?.checkAccess === checkAccess ? failure.message : null;
  const rerun = () => {
    setFailure(null);
    access.retry();
  };
  // Only from the check that just ran, so a stale list never lingers.
  const current = access.status === "ready" && !currentFailure &&
    gaps?.key === `${azureAccount?.homeAccountId}|${subscriptionId}|${tenantId}|${requestKey}` ? gaps : null;
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
  // TODO: merge result, failure, gaps and registering into one state machine.
  const warning = current ? gapsMessage(current) : "";
  return {
    ...access,
    // ...(currentFailure ? { status: "error" as const, error: currentFailure.message, failureKind: currentFailure.failureKind } : {}),
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

export type CardResourceAccess = ReturnType<typeof useCardResourceAccess>;
