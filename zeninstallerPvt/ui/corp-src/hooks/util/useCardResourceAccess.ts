/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useState } from "react";
import { ensureCardResourceAccess, formatAzureAccessError, type CardResourceAccessRequest } from "../../api/azureArm";
import { ensureStaticSiteDataReadAccess } from "../../api/azureBlob";
import { useSubscriptionAccess } from "./useResourceGroupCreationAccess";
import type { AzureTarget } from "../../types";

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
  const access = useSubscriptionAccess(target, checkAccess);
  const [failure, setFailure] = useState<{
    account: typeof azureAccount; subscriptionId: string; tenantId: string | undefined;
    checkAccess: typeof checkAccess; message: string;
  } | null>(null);
  const reportFailure = useCallback((error: unknown) => {
    setFailure({ account: azureAccount, subscriptionId, tenantId, checkAccess, message: formatAzureAccessError(error) });
  }, [azureAccount, subscriptionId, tenantId, checkAccess]);
  const check = useCallback(async () => {
    if (!azureAccount || !subscriptionId) throw new Error("Select an Azure account and subscription before checking resource access.");
    try {
      await checkAccess(azureAccount, subscriptionId, tenantId);
      setFailure(null);
    } catch (error) {
      const message = formatAzureAccessError(error);
      reportFailure(error);
      throw new Error(message, { cause: error });
    }
  }, [azureAccount, subscriptionId, tenantId, checkAccess, reportFailure]);
  const currentFailure = failure?.account === azureAccount && failure?.subscriptionId === subscriptionId &&
    failure?.tenantId === tenantId && failure?.checkAccess === checkAccess ? failure.message : null;
  return {
    ...access,
    ...(currentFailure ? { status: "error" as const, error: currentFailure } : {}),
    retry: () => { setFailure(null); access.retry(); },
    check,
    reportFailure,
  };
}

export type CardResourceAccess = ReturnType<typeof useCardResourceAccess>;
