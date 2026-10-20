/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import {
  appInsightsScope,
  ensureAppInsights,
  ensureFlexFunctionApp,
  ensureFlexServicePlan,
  ensureLogAnalyticsWorkspace,
  ensureRbacRoleAtScope,
  ensureResourceGroup,
  ensureStorageAccount,
  findStorageAccountGroup,
  getAppInsightsConnectionString,
  listLocations,
  type AzureLocation,
  storageAccountNameAvailable,
  ensureStorageContainer,
  ensureStorageTable,
  ensureWebPubSub,
  ensureWebPubSubHub,
  servicePlanId,
  storageAccountScope,
  webPubSubScope,
} from "../../api/azureArm";
import { createAppRegistration, createServicePrincipal, ensureFederatedCredential, getExistingApp, getExistingSP } from "../../api/azureGraph";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { useProviderRegistration } from "../../hooks/util/useProviderRegistration";
import {
  DEFAULT_AZURE_LOCATION,
  PRIVATE_APP_INSIGHTS,
  PRIVATE_FUNCTION_APP,
  PRIVATE_LOG_ANALYTICS,
  PRIVATE_PIPELINE_APP,
  PRIVATE_RESOURCE_GROUP,
  PRIVATE_WEB_PUBSUB,
  TERMINAL_DEPLOY_CONTAINER,
  TERMINAL_HUB,
  TERMINAL_SESSION_TABLE,
  getApiStorageAccountName,
  getFederatedCredential,
} from "../../logic/naming";
import { REMOTE_TERMINAL_PROVIDERS } from "../../config/azureConfig";
import { createResultStorage } from "../../logic/resultStorage";
import type { Account, AzureConfigHook, AzureTarget, CardHook, CardStatus, SetupStep } from "../../types";

export type RemoteTerminalInfraResult = {
  subscriptionId: string;
  apiUrl: string;
  webPubSubHost: string;
  hubName: string;
  pipelineClientId: string;
  pipelineTenantId: string;
  appInsightsConnectionString: string;
  storageAccountName: string;
};

export interface UseRemoteTerminalInfraCardParams extends AzureTarget {
  variableValues: Record<string, string>;
  // Origins the browser calls /register and /negotiate from; without them every session fails on CORS.
  allowedOrigins: string[];
  githubAccount: Account | null;
  githubRepo: string;
  // GitHub's numeric repo id — needed for the immutable OIDC subject.
  githubRepoId: number | null;
  // The OIDC credential is added for this environment only — the one the variables are saved to.
  githubEnvName: string | null;
}

export interface UseRemoteTerminalInfraCard extends CardHook, AzureConfigHook {
  readonly cardId: "remote_terminal_infra";
  location: string;
  setLocation: (loc: string) => void;
  locations: AzureLocation[];
  locationsLoading: boolean;
  resourceGroupName: string;
  webPubSubName: string;
  functionAppName: string;
  storageAccountName: string;
  setStorageAccount: (name: string) => void;
  storageChecking: boolean;
  storageError: string | null;
  checkStorageAccount: () => Promise<boolean>;
  lawName: string;
  appInsightsName: string;
  hubName: string;
  pipelineAppName: string;
  result: RemoteTerminalInfraResult | null;
  resultMatches: boolean;
  runNonce: number;
}

const RESULT_KEY = "zeninstaller_remote_terminal_infra_result";
const { save: saveResult, load: loadResult } = createResultStorage<RemoteTerminalInfraResult>(RESULT_KEY);

/*
 * The relay the stage-card terminal runs on: Web PubSub, the session table, and the Function App
 * that issues group-scoped tokens. Mirrors web/deploy-remote-terminal/env, built from the browser
 * instead of Terraform. Every connection is managed identity — nothing here stores a key.
 */
export function useRemoteTerminalInfraCard({
  azureAccount,
  subscriptionId,
  variableValues,
  tenantId,
  allowedOrigins,
  githubAccount,
  githubRepo,
  githubRepoId,
  githubEnvName,
}: UseRemoteTerminalInfraCardParams): UseRemoteTerminalInfraCard {
  const [location, setLocation] = useState(DEFAULT_AZURE_LOCATION);
  const [locations, setLocations] = useState<AzureLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const { ensureRegistered } = useProviderRegistration({ azureAccount, subscriptionId, tenantId });
  const [result, setResult] = useState<RemoteTerminalInfraResult | null>(loadResult);
  const [runNonce, setRunNonce] = useState(0);
  const [storageOverride, setStorageOverride] = useState("");
  const [storageChecking, setStorageChecking] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const resourceGroupName = PRIVATE_RESOURCE_GROUP;
  const lawName = PRIVATE_LOG_ANALYTICS;
  const appInsightsName = PRIVATE_APP_INSIGHTS;
  const storageAccountName = storageOverride || variableValues.API_STORAGE_ACCOUNT || getApiStorageAccountName(subscriptionId);
  const webPubSubName = PRIVATE_WEB_PUBSUB;
  const functionAppName = PRIVATE_FUNCTION_APP;
  const planName = `${functionAppName}-plan`;
  const pipelineAppName = PRIVATE_PIPELINE_APP;

  const resultMatches = !!result && result.subscriptionId === subscriptionId;
  const done = resultMatches;
  const azureConfigured = !!azureAccount && !!subscriptionId;

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

  // Load the subscription's available regions once an account + subscription are known.
  useEffect(() => {
    if (!azureAccount || !subscriptionId) {
      setLocations([]);
      return;
    }
    let cancelled = false;
    setLocationsLoading(true);
    listLocations(azureAccount, subscriptionId, tenantId)
      .then((locs) => {
        if (!cancelled) setLocations(locs);
      })
      .catch(() => {
        // The text field below takes a region by hand when the list can't be loaded.
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId]);

  const reset = useCallback(() => {
    resetSteps();
    setResult(null);
    saveResult(null);
  }, [resetSteps]);

  const run = useCallback(async () => {
    if (!azureAccount || !subscriptionId) return;
    if (!githubAccount || !githubRepo || githubRepoId === null || !githubEnvName) {
      setSteps([
        {
          id: "github",
          label: "Check the GitHub repository",
          status: "error",
          detail: "Select the GitHub account, repository and environment first — the OIDC credential is scoped to them",
        },
      ]);
      return;
    }
    const org = githubAccount.login;
    if (!/^[a-z0-9]{3,24}$/.test(storageAccountName)) {
      setSteps([
        {
          id: "name",
          label: "Check resource names",
          status: "error",
          detail: `"${storageAccountName}" can't be a storage account name (3-24 lowercase letters and digits) — edit it above`,
        },
      ]);
      return;
    }

    setRunning(true);
    const initialSteps: SetupStep[] = [
      { id: "providers", label: "Register required Azure resource providers", status: "pending" },
      { id: "rg", label: `Create resource group ${resourceGroupName}`, status: "pending" },
      { id: "law", label: `Create Log Analytics workspace ${lawName}`, status: "pending" },
      { id: "appins", label: `Create Application Insights ${appInsightsName}`, status: "pending" },
      { id: "storage", label: `Create storage account ${storageAccountName}`, status: "pending" },
      { id: "table", label: `Create ${TERMINAL_SESSION_TABLE} table`, status: "pending" },
      { id: "container", label: `Create ${TERMINAL_DEPLOY_CONTAINER} container`, status: "pending" },
      { id: "wps", label: `Create Web PubSub ${webPubSubName}`, status: "pending" },
      { id: "hub", label: `Configure hub ${TERMINAL_HUB}`, status: "pending" },
      { id: "plan", label: "Create Flex Consumption plan", status: "pending" },
      { id: "app", label: `Create Function App ${functionAppName}`, status: "pending" },
      { id: "rbac", label: "Grant the Function App its data-plane roles", status: "pending" },
      { id: "pipelineApp", label: `Create app registration ${pipelineAppName}`, status: "pending" },
      { id: "pipelineSp", label: `List ${pipelineAppName} under enterprise applications`, status: "pending" },
      { id: "pipelineCreds", label: `Add GitHub OIDC credential for ${githubEnvName}`, status: "pending" },
      { id: "pipelineRbac", label: "Grant it Web PubSub Service Owner", status: "pending" },
    ];
    setSteps(initialSteps);

    const mark = (id: string, r: "created" | "exists") => updateStep(id, r === "exists" ? "skipped" : "done", r === "exists" ? "Already exists" : undefined);

    try {
      updateStep("providers", "running");
      const providers = await ensureRegistered(REMOTE_TERMINAL_PROVIDERS);
      updateStep(
        "providers",
        providers.registered.length === 0 ? "skipped" : "done",
        providers.registered.length === 0 ? "Already registered" : providers.registered.join(", ")
      );

      updateStep("rg", "running");
      mark("rg", await ensureResourceGroup(azureAccount, subscriptionId, resourceGroupName, location, tenantId));

      updateStep("law", "running");
      const law = await ensureLogAnalyticsWorkspace(azureAccount, subscriptionId, resourceGroupName, lawName, location, tenantId);
      mark("law", law.result);

      updateStep("appins", "running");
      mark(
        "appins",
        // App Insights wants the workspace's resource id, not its name.
        await ensureAppInsights(azureAccount, subscriptionId, resourceGroupName, appInsightsName, location, law.id, tenantId)
      );

      updateStep("storage", "running");
      // Storage account names are global, so one that already exists has to be used where it is.
      const storageGroup = (await findStorageAccountGroup(azureAccount, subscriptionId, storageAccountName, tenantId)) ?? resourceGroupName;
      mark("storage", await ensureStorageAccount(azureAccount, subscriptionId, storageGroup, storageAccountName, location, tenantId));

      updateStep("table", "running");
      mark("table", await ensureStorageTable(azureAccount, subscriptionId, storageGroup, storageAccountName, TERMINAL_SESSION_TABLE, tenantId));

      updateStep("container", "running");
      mark("container", await ensureStorageContainer(azureAccount, subscriptionId, storageGroup, storageAccountName, TERMINAL_DEPLOY_CONTAINER, tenantId));

      updateStep("wps", "running");
      mark("wps", await ensureWebPubSub(azureAccount, subscriptionId, resourceGroupName, webPubSubName, location, "Free_F1", tenantId));

      updateStep("hub", "running");
      mark("hub", await ensureWebPubSubHub(azureAccount, subscriptionId, resourceGroupName, webPubSubName, TERMINAL_HUB, tenantId));

      updateStep("plan", "running");
      mark("plan", await ensureFlexServicePlan(azureAccount, subscriptionId, resourceGroupName, planName, location, tenantId));

      updateStep("app", "running");
      const blobBase = `https://${storageAccountName}.blob.core.windows.net`;
      const tableBase = `https://${storageAccountName}.table.core.windows.net`;
      const { result: appResult, principalId } = await ensureFlexFunctionApp(
        azureAccount,
        subscriptionId,
        resourceGroupName,
        functionAppName,
        location,
        servicePlanId(subscriptionId, resourceGroupName, planName),
        `${blobBase}/${TERMINAL_DEPLOY_CONTAINER}`,
        {
          APPLICATIONINSIGHTS_AUTHENTICATION_STRING: "Authorization=AAD",
          AzureWebJobsStorage__accountName: storageAccountName,
          AzureWebJobsStorage__credential: "managedidentity",
          AzureWebJobsStorage__blobServiceUri: `${blobBase}/`,
          AzureWebJobsStorage__tableServiceUri: `${tableBase}/`,
          AzureWebJobsStorage__queueServiceUri: `https://${storageAccountName}.queue.core.windows.net/`,
          // The platform's cors block is separate; the backend reads this one itself.
          ALLOWED_ORIGINS: allowedOrigins.join(","),
          WEBPUBSUB_ENDPOINT: `${webPubSubName}.webpubsub.azure.com`,
          HUB_NAME: TERMINAL_HUB,
          SESSION_TABLE_ACCOUNT_NAME: storageAccountName,
          SESSION_TABLE_NAME: TERMINAL_SESSION_TABLE,
        },
        allowedOrigins,
        tenantId
      );
      mark("app", appResult);

      updateStep("rbac", "running");
      const saScope = storageAccountScope(subscriptionId, storageGroup, storageAccountName);
      const wpsScope = webPubSubScope(subscriptionId, resourceGroupName, webPubSubName);
      const grants: [string, string][] = [
        [saScope, "Storage Blob Data Contributor"],
        [saScope, "Storage Queue Data Contributor"],
        [saScope, "Storage Table Data Contributor"],
        [wpsScope, "Web PubSub Service Owner"],
        [appInsightsScope(subscriptionId, resourceGroupName, appInsightsName), "Monitoring Metrics Publisher"],
      ];
      const assigned: string[] = [];
      for (const [scope, role] of grants) {
        if ((await ensureRbacRoleAtScope(azureAccount, scope, principalId, role, tenantId)) === "created") {
          assigned.push(role);
        }
      }
      updateStep("rbac", assigned.length === 0 ? "skipped" : "done", assigned.length === 0 ? "Already assigned" : assigned.join(", "));

      updateStep("pipelineApp", "running");
      const existingApp = await getExistingApp(azureAccount, pipelineAppName, tenantId);
      const app = existingApp ?? (await createAppRegistration(azureAccount, pipelineAppName, [], tenantId));
      mark("pipelineApp", existingApp ? "exists" : "created");

      updateStep("pipelineSp", "running");
      const existingSp = await getExistingSP(azureAccount, app.appId, tenantId);
      const sp = existingSp ?? (await createServicePrincipal(azureAccount, app.appId, tenantId));
      mark("pipelineSp", existingSp ? "exists" : "created");

      updateStep("pipelineCreds", "running");
      const cred = getFederatedCredential(org, githubAccount.id, githubRepo, githubRepoId, githubEnvName);
      const addedCred = await ensureFederatedCredential(azureAccount, app.id, cred.name, cred.subject, tenantId);
      mark("pipelineCreds", addedCred ? "created" : "exists");

      // Service Owner, not Service Reader: issuing a client token is a POST on the data plane.
      updateStep("pipelineRbac", "running");
      mark("pipelineRbac", await ensureRbacRoleAtScope(azureAccount, wpsScope, sp.id, "Web PubSub Service Owner", tenantId));

      const finished: RemoteTerminalInfraResult = {
        subscriptionId,
        apiUrl: `https://${functionAppName}.azurewebsites.net`,
        webPubSubHost: `${webPubSubName}.webpubsub.azure.com`,
        hubName: TERMINAL_HUB,
        pipelineClientId: app.appId,
        pipelineTenantId: tenantId || azureAccount.tenantId,
        appInsightsConnectionString: await getAppInsightsConnectionString(azureAccount, subscriptionId, resourceGroupName, appInsightsName, tenantId),
        storageAccountName,
      };
      setResult(finished);
      saveResult(finished);
      setRunNonce((n) => n + 1);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error", detail: message } : s)));
    } finally {
      setRunning(false);
    }
  }, [
    allowedOrigins,
    appInsightsName,
    azureAccount,
    ensureRegistered,
    functionAppName,
    lawName,
    location,
    planName,
    resourceGroupName,
    setRunning,
    setSteps,
    githubAccount,
    githubEnvName,
    githubRepo,
    githubRepoId,
    pipelineAppName,
    storageAccountName,
    subscriptionId,
    tenantId,
    updateStep,
    webPubSubName,
  ]);

  const status: CardStatus = !azureConfigured ? "error" : done ? "complete" : "warning";
  const summary = !azureConfigured ? "Unavailable" : done ? "Terminal relay ready" : "Set up the terminal relay";

  return {
    cardId: "remote_terminal_infra" as const,
    location,
    setLocation,
    locations,
    locationsLoading,
    steps,
    running,
    done,
    status,
    summary,
    run,
    reset,
    result,
    resultMatches,
    runNonce,
    resourceGroupName,
    webPubSubName,
    functionAppName,
    storageAccountName,
    setStorageAccount,
    storageChecking,
    storageError,
    checkStorageAccount,
    lawName,
    appInsightsName,
    hubName: TERMINAL_HUB,
    pipelineAppName,
    cardRequirements: ["azure_login", "azure_subscription"],
    cardDependencyLabel: "Set up the private zeninstaller backend environment",
  };
}
