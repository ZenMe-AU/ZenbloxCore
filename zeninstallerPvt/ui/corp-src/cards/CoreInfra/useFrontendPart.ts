/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resourceGroupExists,
  findStorageAccountGroup,
} from "../../api/azureArm";
import type { ProvisionModule } from "../../logic/provisioning";
import { privateFrontendInfraAccess } from "./config";
import { STORAGE_NAME, frontendPart, onForbidden, useResourceName, type ResourceName } from "./provisioningParts";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import {
  PRIVATE_LOG_ANALYTICS,
  PRIVATE_RESOURCE_GROUP,
  getWebStorageAccountName,
} from "../../logic/naming";
import { createResultStorage } from "../../logic/resultStorage";
import type { ResettableHook, AzureTarget, CardHook } from "../../types";

export type PrivateFrontendInfraResult = {
  subscriptionId: string;
  siteStorageAccount: string;
  siteStorageGroup?: string; // An existing account can sit in another group; missing on results saved before it was recorded.
  tenantId: string;
  installerClientId: string;
};

export interface UseFrontendPartParams extends AzureTarget {
  location: string; // The card's region, shared by every part.
  variableValues: Record<string, string>;
  // Origins the browser calls /register and /negotiate from; without them every session fails on CORS.
  allowedOrigins: string[];
}

export interface UseFrontendPart extends Pick<CardHook, "done">, ResettableHook {
  provisioning: ProvisionModule; // This part's tasks, for a card that runs several parts as one graph.
  creationAccess: CardResourceAccess;
  siteStorage: ResourceName; // The account that serves the site.
  resourceGroupName: string;
  lawName: string;
  result: PrivateFrontendInfraResult | null;
  resultMatches: boolean;
  runNonce: number;
}

const RESULT_KEY = "zeninstaller_private_env_result";
const { save: saveResult, load: loadResult } = createResultStorage<PrivateFrontendInfraResult>(RESULT_KEY);

// Everything the private installer site needs before it can be built and uploaded, created from the
// browser rather than Terraform: the group, the workspace it logs to, the storage account that serves
// the site, and the app registration users sign in to.
export function useFrontendPart({
  azureAccount,
  subscriptionId,
  tenantId,
  location,
  allowedOrigins,
  variableValues,
}: UseFrontendPartParams): UseFrontendPart {
  const [result, setResult] = useState<PrivateFrontendInfraResult | null>(loadResult);
  const [runNonce, setRunNonce] = useState(0);

  const resourceGroupName = PRIVATE_RESOURCE_GROUP;
  const lawName = PRIVATE_LOG_ANALYTICS;
  /*
   * Derived from the subscription so it is unique and the same on every re-run. The name is global
   * to Azure, so when another tenant already holds it the field is the way out: type another one.
   */
  const siteStorage = useResourceName({ azureAccount, subscriptionId, tenantId, location }, STORAGE_NAME, variableValues.SITE_STORAGE_ACCOUNT || getWebStorageAccountName(subscriptionId));
  const webStorageAccountName = siteStorage.name;
  const creationAccess = useCardResourceAccess({ azureAccount, subscriptionId, tenantId }, privateFrontendInfraAccess(resourceGroupName, lawName, webStorageAccountName));
  const { reportFailure: reportAccessFailure } = creationAccess;

  const resultMatches = !!result && result.subscriptionId === subscriptionId;

  /*
   * Completion is read back from the things themselves: the group and the site's account from Azure,
   * the client id from the GitHub environment. A record in this browser proves none of them exist.
   */
  const [rgExists, setRgExists] = useState(false);
  const [storageExists, setStorageExists] = useState(false);
  const done = rgExists && storageExists && !!variableValues.VITE_AZURE_CLIENT_ID;

  useEffect(() => {
    if (!azureAccount || !subscriptionId) {
      setRgExists(false);
      setStorageExists(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [rg, storage] = await Promise.all([
        resourceGroupExists(azureAccount, subscriptionId, resourceGroupName, tenantId).catch(() => false),
        findStorageAccountGroup(azureAccount, subscriptionId, webStorageAccountName, tenantId).catch(() => null),
      ]);
      if (cancelled) return;
      setRgExists(rg);
      setStorageExists(!!storage);
    })();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId, resourceGroupName, webStorageAccountName, runNonce]);

  const provisioning = useMemo<ProvisionModule>(() => ({
    id: "private_frontend_infra",
    label: "Frontend hosting",
    onTaskError: onForbidden(reportAccessFailure),
    onComplete: (output) => {
      const finished: PrivateFrontendInfraResult = {
        subscriptionId,
        siteStorageAccount: webStorageAccountName,
        siteStorageGroup: output<{ group: string }>("webStorage").group,
        tenantId: tenantId || (azureAccount?.tenantId ?? ""),
        installerClientId: output<string>("installerApp"),
      };
      setResult(finished);
      saveResult(finished);
      setRunNonce((n) => n + 1);
    },
    tasks: frontendPart({ azureAccount, subscriptionId, tenantId, location, resourceGroupName, lawName, webStorageAccountName, allowedOrigins }),
  }), [allowedOrigins, lawName, resourceGroupName, azureAccount, reportAccessFailure, location, subscriptionId, tenantId, webStorageAccountName]);

  const reset = useCallback(() => {
    setResult(null);
    saveResult(null);
  }, []);

  return {
    creationAccess,
    siteStorage,
    provisioning,
    done,
    reset,
    result,
    resultMatches,
    runNonce,
    resourceGroupName,
    lawName,
  };
}
