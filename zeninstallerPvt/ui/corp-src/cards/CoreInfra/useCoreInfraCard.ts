/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import {
  ensureResourceGroup,
  resourceGroupExists,
  ensureLogAnalyticsWorkspace,
  ensureSubscriptionDiagnostics,
  ensureStorageAccount,
  ensureStorageContainer,
  ensureDeleteLock,
  ensureBlobDiagnostics,
  findStorageAccountGroup,
  storageAccountNameAvailable,
  ensureRbacRoleAtScope,
  hasRbacRoleAtScope,
  storageAccountScope,
  resourceGroupScope,
  listLocations,
  type AzureLocation,
} from "../../api/azureArm";
import { getExistingSP } from "../../api/azureGraph";
import { ensureScopeConsent } from "../../auth/msal";
import {
  getCoreResourceGroupName,
  getCoreLogAnalyticsName,
  DIAGNOSTIC_SETTING_NAME,
  DEFAULT_AZURE_LOCATION,
  TFSTATE_CONTAINER,
  TFSTATE_LOCK_NAME,
  getCoreStorageAccountName,
} from "../../logic/naming";
import { createResultStorage } from "../../logic/resultStorage";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { APP_SCOPES, AZURE_CLIENT_ID, CORE_INFRA_PROVIDERS } from "../../config/azureConfig";
import { useProviderRegistration } from "../../hooks/util/useProviderRegistration";
import type { AzureConfigHook, AzureSpTarget, CardHook, CardRequirements, CardStatus, SetupStep } from "../../types";

export type CoreInfraResult = {
  corpName: string;
  subscriptionId: string;
  storageAccountName: string;
  stateResourceGroup: string; // Where the account actually lives, which is not always this card's own group.
};

export type CoreInfraRbacStatus = "unknown" | "rg-not-found" | "missing-role" | "ready";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCoreInfraCardParams extends AzureSpTarget {
  corpName: string;
  variableValues: Record<string, string>;
}

// steps / running / run / reset come from AzureConfigHook.
export interface UseCoreInfraCard extends CardHook, AzureConfigHook {
  readonly cardId: "core_infra";
  location: string;
  setLocation: (loc: string) => void;
  locations: AzureLocation[];
  locationsLoading: boolean;
  locationsError: string | null;
  infraRbacStatus: CoreInfraRbacStatus;
  resultMatches: boolean;
  resourceGroupName: string;
  lawName: string;
  storageAccountName: string;
  setStorageAccount: (name: string) => void;
  storageChecking: boolean;
  storageError: string | null;
  checkStorageAccount: () => Promise<boolean>;
  containerName: string;
  result: CoreInfraResult | null;
  runNonce: number;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Set up Corp infrastructure")
}

const RESULT_KEY = "zeninstaller_infra_result";

const { save: saveResult, load: loadResult } = createResultStorage<CoreInfraResult>(RESULT_KEY);

export function useCoreInfraCard({
  azureAccount,
  subscriptionId,
  corpName,
  spClientId,
  tenantId,
  variableValues,
}: UseCoreInfraCardParams): UseCoreInfraCard {
  const [location, setLocation] = useState(DEFAULT_AZURE_LOCATION);
  const [locations, setLocations] = useState<AzureLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const { ensureRegistered } = useProviderRegistration({ azureAccount, subscriptionId, tenantId });
  const [result, setResult] = useState<CoreInfraResult | null>(loadResult);
  const [infraRbacStatus, setInfraRbacStatus] = useState<CoreInfraRbacStatus>("unknown");
  const [provisionedFor, setProvisionedFor] = useState<string | null>(null); // "corpName|subscriptionId"
  const [storageOverride, setStorageOverride] = useState("");
  const [storageChecking, setStorageChecking] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);

  const resultMatches = !!result && result.corpName === corpName && result.subscriptionId === subscriptionId;
  // Live rather than localStorage-trusting: the resource group could've been deleted, or the SP's
  // access revoked, since this last ran (or on another device where nothing was ever persisted here).
  const infraTrusted = !!corpName && !!subscriptionId && provisionedFor === `${corpName}|${subscriptionId}`;
  const done = (infraTrusted || infraRbacStatus === "ready") && !!variableValues.TF_STATE_STORAGE_ACCOUNT;

  useEffect(() => {
    if (result && !resultMatches) resetSteps();
  }, [result, resultMatches, resetSteps]);

  const resourceGroupName = getCoreResourceGroupName(corpName);
  const lawName = getCoreLogAnalyticsName(corpName);
  const storageAccountName = storageOverride || variableValues.TF_STATE_STORAGE_ACCOUNT || getCoreStorageAccountName(corpName);

  // Too long or bad characters are visible as you type; too short or taken is only known on confirm.
  const setStorageAccount = useCallback((name: string) => {
    setStorageOverride(name);
    setStorageError(
      name.length > 24 ? `${name.length} characters; Azure allows 24` : /^[a-z0-9]*$/.test(name) ? null : "Lowercase letters and digits only"
    );
  }, []);

  // An account this subscription can see is the customer's own, so it is reused wherever it lives.
  const checkStorageAccount = useCallback(async (): Promise<boolean> => {
    const name = storageAccountName;
    if (!/^[a-z0-9]{3,24}$/.test(name)) {
      setStorageError("3-24 characters, lowercase letters and digits only");
      return false;
    }
    if (!azureAccount || !subscriptionId) return true;
    setStorageChecking(true);
    setStorageError(null);
    try {
      if (await findStorageAccountGroup(azureAccount, subscriptionId, name, tenantId)) return true;
      if (await storageAccountNameAvailable(azureAccount, subscriptionId, name, tenantId)) return true;
      setStorageError("This name is taken somewhere in Azure — choose a different one");
      return false;
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : "Could not check the name");
      return false;
    } finally {
      setStorageChecking(false);
    }
  }, [azureAccount, subscriptionId, tenantId, storageAccountName]);

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

  // Load the subscription's available regions once an account + subscription are known.
  useEffect(() => {
    if (!azureAccount || !subscriptionId) {
      setLocations([]);
      return;
    }
    let cancelled = false;
    setLocationsLoading(true);
    setLocationsError(null);
    listLocations(azureAccount, subscriptionId, tenantId)
      .then((locs) => {
        if (!cancelled) setLocations(locs);
      })
      .catch((err) => {
        if (!cancelled) setLocationsError(err instanceof Error ? err.message : "Failed to load Azure regions");
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId]);

  const run = useCallback(async () => {
    if (!azureAccount || !subscriptionId || !corpName || !spClientId) return;
    setRunning(true);

    const initialSteps: SetupStep[] = [
      { id: "consent", label: "Confirm Microsoft permissions", status: "pending" },
      { id: "providers", label: "Register required Azure resource providers", status: "pending" },
      { id: "rg", label: `Create resource group ${resourceGroupName}`, status: "pending" },
      { id: "rg-rbac", label: "Grant GitHub Actions access to the resource group", status: "pending" },
      { id: "law", label: `Create Log Analytics workspace ${lawName}`, status: "pending" },
      { id: "diag", label: "Configure subscription activity-log diagnostics", status: "pending" },
      { id: "storage", label: `Create storage account ${storageAccountName}`, status: "pending" },
      { id: "container", label: `Create ${TFSTATE_CONTAINER} container`, status: "pending" },
      { id: "lock", label: "Lock the storage account against deletion", status: "pending" },
      { id: "blobdiag", label: "Send state writes and deletes to the workspace", status: "pending" },
      { id: "rbac", label: "Grant GitHub Actions access to Terraform state", status: "pending" },
    ];
    setSteps(initialSteps);

    let currentStep = "consent";
    let sp: Awaited<ReturnType<typeof getExistingSP>> = null;
    try {
      if (!/^[a-z0-9]{3,24}$/.test(storageAccountName)) {
        currentStep = "storage";
        throw new Error(`"${storageAccountName}" can't be a storage account name (3-24 lowercase letters and digits) — edit it above`);
      }
      currentStep = "consent";
      updateStep("consent", "running");
      const promptedGraph = await ensureScopeConsent(azureAccount, [...APP_SCOPES], tenantId);
      updateStep("consent", promptedGraph ? "done" : "skipped", promptedGraph ? undefined : "Already granted");

      currentStep = "providers";
      updateStep("providers", "running");
      const providers = await ensureRegistered(CORE_INFRA_PROVIDERS);
      updateStep(
        "providers",
        providers.registered.length === 0 ? "skipped" : "done",
        providers.registered.length === 0 ? "Already registered" : providers.registered.join(", ")
      );

      currentStep = "rg";
      updateStep("rg", "running");
      const rgResult = await ensureResourceGroup(azureAccount, subscriptionId, resourceGroupName, location, tenantId);
      updateStep("rg", rgResult === "exists" ? "skipped" : "done", rgResult === "exists" ? "Already exists" : undefined);

      currentStep = "rg-rbac";
      updateStep("rg-rbac", "running");
      sp = await getExistingSP(azureAccount, spClientId, tenantId);
      if (!sp) throw new Error(`Service principal for app ${spClientId} not found — run the Azure card first`);
      const rgScope = resourceGroupScope(subscriptionId, resourceGroupName);
      const rgRbac = await ensureRbacRoleAtScope(azureAccount, rgScope, sp.id, "Reader", tenantId);
      updateStep("rg-rbac", rgRbac === "exists" ? "skipped" : "done", rgRbac === "exists" ? "Already assigned" : "Reader");

      currentStep = "law";
      updateStep("law", "running");
      const law = await ensureLogAnalyticsWorkspace(azureAccount, subscriptionId, resourceGroupName, lawName, location, tenantId);
      updateStep("law", law.result === "exists" ? "skipped" : "done", law.result === "exists" ? "Already exists" : undefined);

      currentStep = "diag";
      updateStep("diag", "running");
      const diag = await ensureSubscriptionDiagnostics(azureAccount, subscriptionId, DIAGNOSTIC_SETTING_NAME, law.id, tenantId);
      updateStep("diag", diag === "exists" ? "skipped" : "done", diag === "exists" ? "Already configured" : undefined);

      currentStep = "storage";
      updateStep("storage", "running");
      // Storage account names are global, so one that already exists has to be used where it is.
      const storageGroup = (await findStorageAccountGroup(azureAccount, subscriptionId, storageAccountName, tenantId)) ?? resourceGroupName;
      const storage = await ensureStorageAccount(azureAccount, subscriptionId, storageGroup, storageAccountName, location, tenantId);
      updateStep("storage", storage === "exists" ? "skipped" : "done", storage === "exists" ? "Already exists" : undefined);

      currentStep = "container";
      updateStep("container", "running");
      const container = await ensureStorageContainer(azureAccount, subscriptionId, storageGroup, storageAccountName, TFSTATE_CONTAINER, tenantId);
      updateStep("container", container === "exists" ? "skipped" : "done", container === "exists" ? "Already exists" : undefined);

      // Locking the account also stops its group being deleted, without freezing anything else in the group.
      currentStep = "lock";
      updateStep("lock", "running");
      const scope = storageAccountScope(subscriptionId, storageGroup, storageAccountName);
      const lock = await ensureDeleteLock(azureAccount, scope, TFSTATE_LOCK_NAME, "Holds Terraform state for every stage.", tenantId);
      updateStep("lock", lock === "exists" ? "skipped" : "done", lock === "exists" ? "Already locked" : "CanNotDelete");

      // The lock stops neither a write nor a delete of the state itself, so the log is how either is found out.
      currentStep = "blobdiag";
      updateStep("blobdiag", "running");
      const blobDiag = await ensureBlobDiagnostics(
        azureAccount,
        subscriptionId,
        storageGroup,
        storageAccountName,
        DIAGNOSTIC_SETTING_NAME,
        law.id,
        tenantId
      );
      updateStep("blobdiag", blobDiag === "exists" ? "skipped" : "done", blobDiag === "exists" ? "Already configured" : "StorageWrite, StorageDelete");

      currentStep = "rbac";
      updateStep("rbac", "running");
      const rbac = await ensureRbacRoleAtScope(azureAccount, scope, sp.id, "Storage Blob Data Reader", tenantId);
      updateStep("rbac", rbac === "exists" ? "skipped" : "done", rbac === "exists" ? "Already assigned" : "Storage Blob Data Reader");

      const r: CoreInfraResult = { corpName, subscriptionId, storageAccountName, stateResourceGroup: storageGroup };
      setResult(r);
      saveResult(r);
      setProvisionedFor(`${corpName}|${subscriptionId}`);
      setRunNonce((n) => n + 1);
    } catch (err) {
      updateStep(currentStep, "error", err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }, [
    azureAccount,
    subscriptionId,
    corpName,
    spClientId,
    location,
    tenantId,
    resourceGroupName,
    lawName,
    storageAccountName,
    setSteps,
    setRunning,
    updateStep,
    ensureRegistered,
  ]);

  const reset = useCallback(() => {
    resetSteps();
    setResult(null);
    saveResult(null);
    setProvisionedFor(null);
  }, [resetSteps]);

  const azureConfigured = !!AZURE_CLIENT_ID;
  // Assumes prerequisites are met — App locks this card (via cardRequirements) whenever they're not,
  // which overrides this status to "idle" regardless of what's computed here.
  const status: CardStatus = !azureConfigured ? "error" : done ? "complete" : "warning";
  const summary = !azureConfigured ? "Unavailable" : done ? "Infrastructure ready" : "Set up corp infrastructure";

  return {
    location,
    setLocation,
    locations,
    locationsLoading,
    locationsError,
    cardId: "core_infra" as const,
    steps,
    running,
    done,
    status,
    summary,
    infraRbacStatus,
    resultMatches,
    run,
    reset,
    resourceGroupName,
    lawName,
    storageAccountName,
    setStorageAccount,
    storageChecking,
    storageError,
    checkStorageAccount,
    containerName: TFSTATE_CONTAINER,
    result,
    runNonce,
    cardRequirements: ["azure_login", "repo", "azure_subscription", "azure_app_registration"],
    cardDependencyLabel: "Set up Corp infrastructure",
  };
}
