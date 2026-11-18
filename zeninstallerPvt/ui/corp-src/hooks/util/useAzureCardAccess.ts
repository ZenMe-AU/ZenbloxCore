/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useState } from "react";
import { ensureCardResourceAccess, formatAzureAccessError } from "../../api/azureArm";
import { ensureEntraActions } from "../../api/azureGraph";
import { ensureScopeConsent } from "../../auth/msal";
import { ROLE_READ_SCOPES } from "../../config/azureConfig";
import { useSubscriptionAccess } from "./useAzureAccessCheck";
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

// pre-flight warning panel for Azure resource permissions; card-specific checks (data plane, Graph) are called by the card when it chooses
export function useCardResourceAccess(target: AzureTarget, request: CardResourceAccessRequest) {
  const { azureAccount, subscriptionId, tenantId } = target;
  const requestKey = JSON.stringify(request);
  const checkAccess = useCallback(async (account: NonNullable<AzureTarget["azureAccount"]>, subscription: string, tenant?: string) => {
    const request = JSON.parse(requestKey) as CardResourceAccessRequest;
    await ensureCardResourceAccess(account, subscription, request, tenant);
    if (request.entraRoles.length) await ensureEntraActions(account, request.entraRoles, tenant);
  }, [requestKey]);
  const access = useSubscriptionAccess(target, checkAccess, formatCardResourceAccessError);
  const [failure, setFailure] = useState<{
    account: typeof azureAccount; subscriptionId: string; tenantId: string | undefined;
    checkAccess: typeof checkAccess; message: string;
  } | null>(null);
  const reportFailure = useCallback((error: unknown) => {
    setFailure({
      account: azureAccount, subscriptionId, tenantId, checkAccess,
      message: formatCardResourceAccessError(error),
    });
  }, [azureAccount, subscriptionId, tenantId, checkAccess]);
  const check = useCallback(async () => {
    if (!azureAccount || !subscriptionId) throw new Error("Select an Azure account and subscription before checking resource access.");
    try {
      await checkAccess(azureAccount, subscriptionId, tenantId);
      setFailure(null);
    } catch (error) {
      reportFailure(error);
      throw new Error(formatCardResourceAccessError(error), { cause: error });
    }
  }, [azureAccount, subscriptionId, tenantId, checkAccess, reportFailure]);
  const currentFailure = failure?.account === azureAccount && failure?.subscriptionId === subscriptionId &&
    failure?.tenantId === tenantId && failure?.checkAccess === checkAccess ? failure.message : null;
  const rerun = () => {
    setFailure(null);
    access.retry();
  };
  // Recheck is a click, so it may redirect to grant the Entra role read scope; the automatic check stays silent.
  const retry = () => {
    if (!request.entraRoles.length || !azureAccount) return rerun();
    void ensureScopeConsent(azureAccount, ROLE_READ_SCOPES, tenantId).then((redirecting) => redirecting || rerun(), reportFailure);
  };
  return {
    ...access,
    ...(currentFailure ? { status: "error" as const, error: currentFailure } : {}),
    retry,
    check,
    reportFailure,
  };
}

export type CardResourceAccess = ReturnType<typeof useCardResourceAccess>;
