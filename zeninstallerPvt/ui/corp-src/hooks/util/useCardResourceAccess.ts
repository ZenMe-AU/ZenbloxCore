/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useState } from "react";
import { ensureCardResourceAccess, formatAzureAccessError, type CardResourceAccessRequest } from "../../api/azureArm";
import { ensureStaticSiteDataReadAccess } from "../../api/azureBlob";
import { ensureServicePrincipalAccess } from "../../api/azureGraph";
import { useSubscriptionAccess } from "./useResourceGroupCreationAccess";
import type { AzureTarget } from "../../types";

function formatGraphAccessError(error: unknown): string {
  const details = error instanceof Error ? error.message : String(error);
  if (!/\b403\b|Authorization_RequestDenied|Insufficient privileges/i.test(details)) return details;
  return `Microsoft Graph denied service-principal access. This card needs the Application.ReadWrite.All delegated permission with admin consent and a supported Microsoft Entra role, such as Application Administrator or Cloud Application Administrator. For a single-tenant app you own, Application Developer may apply. Ask your tenant administrator to grant or activate access, then recheck. Details: ${details}`;
}

export function formatCardResourceAccessError(error: unknown, card: CardResourceAccessRequest["card"]): string {
  const details = error instanceof Error ? error.message : String(error);
  return card === "appRegistration" && /servicePrincipals|Authorization_RequestDenied/i.test(details)
    ? formatGraphAccessError(error)
    : formatAzureAccessError(error);
}

// pre-flight warning panel for Azure resource permissions
export function useCardResourceAccess(
  target: AzureTarget,
  { card, resourceGroup, workspace, storageAccount, dnsZone, appInsights, webPubSub, functionApp, servicePlan }: CardResourceAccessRequest
) {
  const { azureAccount, subscriptionId, tenantId } = target;
  const checkAccess = useCallback(async (account: NonNullable<AzureTarget["azureAccount"]>, subscription: string, tenant?: string) => {
    await ensureCardResourceAccess(account, subscription, {
      card, resourceGroup, workspace, storageAccount, dnsZone, appInsights, webPubSub, functionApp, servicePlan,
    }, tenant);
    if (card === "webDeploy" && storageAccount) await ensureStaticSiteDataReadAccess(account, storageAccount, tenant);
  }, [card, resourceGroup, workspace, storageAccount, dnsZone, appInsights, webPubSub, functionApp, servicePlan]);
  const formatError = useCallback((error: unknown) => formatCardResourceAccessError(error, card), [card]);
  const access = useSubscriptionAccess(target, checkAccess, formatError);
  const [failure, setFailure] = useState<{
    account: typeof azureAccount; subscriptionId: string; tenantId: string | undefined;
    checkAccess: typeof checkAccess; message: string;
  } | null>(null);
  const reportFailure = useCallback((error: unknown) => {
    setFailure({
      account: azureAccount, subscriptionId, tenantId, checkAccess,
      message: formatCardResourceAccessError(error, card),
    });
  }, [azureAccount, subscriptionId, tenantId, card, checkAccess]);
  const check = useCallback(async () => {
    if (!azureAccount || !subscriptionId) throw new Error("Select an Azure account and subscription before checking resource access.");
    try {
      await checkAccess(azureAccount, subscriptionId, tenantId);
      setFailure(null);
    } catch (error) {
      reportFailure(error);
      throw new Error(formatCardResourceAccessError(error, card), { cause: error });
    }
  }, [azureAccount, subscriptionId, tenantId, card, checkAccess, reportFailure]);
  const currentFailure = failure?.account === azureAccount && failure?.subscriptionId === subscriptionId &&
    failure?.tenantId === tenantId && failure?.checkAccess === checkAccess ? failure.message : null;
  const retry = () => {
    setFailure(null);
    access.retry();
    if (card === "appRegistration" && azureAccount && subscriptionId) {
      // rechecks Graph reads only; Graph remains authoritative for app/service-principal writes.
      void ensureServicePrincipalAccess(azureAccount, tenantId).catch(reportFailure);
    }
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
