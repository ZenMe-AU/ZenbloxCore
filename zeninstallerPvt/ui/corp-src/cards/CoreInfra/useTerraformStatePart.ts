/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resourceGroupExists,
  hasRbacRoleAtScope,
  resourceGroupScope,
} from "../../api/azureArm";
import { getExistingSP } from "../../api/azureGraph";
import {
  getCoreResourceGroupName,
  getCoreLogAnalyticsName,
  TFSTATE_CONTAINER,
  getCoreStorageAccountName,
} from "../../logic/naming";
import { createResultStorage } from "../../logic/resultStorage";
import type { ProvisionModule } from "../../logic/provisioning";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import { coreInfraAccess } from "./config";
import { STORAGE_NAME, terraformStatePart, onForbidden, useResourceName, type ResourceName } from "./provisioningParts";
import type { ResettableHook, AzureSpTarget, CardHook } from "../../types";

export type CoreInfraResult = {
  corpName: string;
  subscriptionId: string;
  storageAccountName: string;
  stateResourceGroup: string; // Where the account actually lives, which is not always this card's own group.
};

export type CoreInfraRbacStatus = "unknown" | "rg-not-found" | "missing-role" | "ready";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseTerraformStatePartParams extends AzureSpTarget {
  location: string; // The card's region, shared by every part.
  corpName: string;
  variableValues: Record<string, string>;
}

export interface UseTerraformStatePart extends Pick<CardHook, "done">, ResettableHook {
  provisioning: ProvisionModule; // This part's tasks, for a card that runs several parts as one graph.
  creationAccess: CardResourceAccess;
  infraRbacStatus: CoreInfraRbacStatus;
  resultMatches: boolean;
  resourceGroupName: string;
  lawName: string;
  storage: ResourceName; // The Terraform state account.
  containerName: string;
  result: CoreInfraResult | null;
  runNonce: number;
}

const RESULT_KEY = "zeninstaller_infra_result";

const { save: saveResult, load: loadResult } = createResultStorage<CoreInfraResult>(RESULT_KEY);

export function useTerraformStatePart({
  azureAccount,
  subscriptionId,
  location,
  corpName,
  spClientId,
  tenantId,
  variableValues,
}: UseTerraformStatePartParams): UseTerraformStatePart {
  const [result, setResult] = useState<CoreInfraResult | null>(loadResult);
  const [infraRbacStatus, setInfraRbacStatus] = useState<CoreInfraRbacStatus>("unknown");
  const [provisionedFor, setProvisionedFor] = useState<string | null>(null); // "corpName|subscriptionId"
  const [runNonce, setRunNonce] = useState(0);

  const resultMatches = !!result && result.corpName === corpName && result.subscriptionId === subscriptionId;
  // Live rather than localStorage-trusting: the resource group could've been deleted, or the SP's
  // access revoked, since this last ran (or on another device where nothing was ever persisted here).
  const infraTrusted = !!corpName && !!subscriptionId && provisionedFor === `${corpName}|${subscriptionId}`;
  const done = (infraTrusted || infraRbacStatus === "ready") && !!variableValues.TF_STATE_STORAGE_ACCOUNT;

  const resourceGroupName = getCoreResourceGroupName(corpName);
  const lawName = getCoreLogAnalyticsName(corpName);
  const storage = useResourceName({ azureAccount, subscriptionId, tenantId, location }, STORAGE_NAME, variableValues.TF_STATE_STORAGE_ACCOUNT || getCoreStorageAccountName(corpName));
  const storageAccountName = storage.name;
  const creationAccess = useCardResourceAccess({ azureAccount, subscriptionId: corpName ? subscriptionId : "", tenantId }, coreInfraAccess(resourceGroupName, lawName, storageAccountName));
  const { reportFailure: reportAccessFailure } = creationAccess;

  // Live check: does the resource group exist, and does the SP hold Reader on it (directly or
  // inherited from the subscription)? Mirrors useRbacCheck's sp-not-found/missing-role split.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!azureAccount || !subscriptionId || !spClientId || !resourceGroupName) {
        if (!cancelled) setInfraRbacStatus("unknown");
        return;
      }
      if (!cancelled) setInfraRbacStatus("unknown");
      try {
        const exists = await resourceGroupExists(azureAccount, subscriptionId, resourceGroupName, tenantId);
        if (cancelled) return;
        if (!exists) {
          setInfraRbacStatus("rg-not-found");
          return;
        }
        const sp = await getExistingSP(azureAccount, spClientId, tenantId);
        if (cancelled) return;
        if (!sp) {
          setInfraRbacStatus("missing-role");
          return;
        }
        const hasRole = await hasRbacRoleAtScope(azureAccount, resourceGroupScope(subscriptionId, resourceGroupName), sp.id, "Reader", tenantId);
        if (!cancelled) setInfraRbacStatus(hasRole ? "ready" : "missing-role");
      } catch {
        // Consent/token errors — leave unknown rather than flag broken.
        if (!cancelled) setInfraRbacStatus("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, spClientId, resourceGroupName, tenantId]);

  const provisioning = useMemo<ProvisionModule>(() => ({
    id: "core_infra",
    label: "Core infrastructure",
    onTaskError: onForbidden(reportAccessFailure),
    onComplete: (output) => {
      const r: CoreInfraResult = { corpName, subscriptionId, storageAccountName, stateResourceGroup: output<{ group: string }>("storage").group };
      setResult(r);
      saveResult(r);
      setProvisionedFor(`${corpName}|${subscriptionId}`);
      setRunNonce((n) => n + 1);
    },
    tasks: terraformStatePart({ azureAccount, subscriptionId, tenantId, location, corpName, spClientId, resourceGroupName, lawName, storageAccountName }),
  }), [azureAccount, subscriptionId, corpName, spClientId, location, tenantId, resourceGroupName, lawName, storageAccountName, reportAccessFailure]);

  const reset = useCallback(() => {
    setResult(null);
    saveResult(null);
    setProvisionedFor(null);
  }, []);

  return {
    creationAccess,
    provisioning,
    done,
    infraRbacStatus,
    resultMatches,
    reset,
    resourceGroupName,
    lawName,
    storage,
    containerName: TFSTATE_CONTAINER,
    result,
    runNonce,
  };
}
