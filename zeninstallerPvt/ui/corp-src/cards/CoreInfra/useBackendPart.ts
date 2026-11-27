/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useMemo, useState } from "react";
import type { ProvisionModule } from "../../logic/provisioning";
import { remoteTerminalInfraAccess } from "./config";
import { FUNCTION_APP_NAME, STORAGE_NAME, WEB_PUBSUB_NAME, backendPart, onForbidden, useResourceName, type ResourceName } from "./provisioningParts";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import {
  PRIVATE_APP_INSIGHTS,
  PRIVATE_LOG_ANALYTICS,
  PRIVATE_PIPELINE_APP,
  PRIVATE_RESOURCE_GROUP,
  TERMINAL_HUB,
  getApiStorageAccountName,
  getWebPubSubName,
  getFunctionAppName,
  functionAppFromApiUrl,
} from "../../logic/naming";
import { DEPLOYMENT_TERMINAL_KEYS } from "../../logic/variables";
import type { Account, AzureTarget, CardHook, SetupStep } from "../../types";

export type RemoteTerminalInfraResult = {
  subscriptionId: string;
  apiUrl: string;
  webPubSubHost: string;
  hubName: string;
  pipelineClientId: string;
  pipelineTenantId: string;
  appInsightsConnectionString: string;
  storageAccountName: string;
  // Existing resources can sit in other groups; missing on results saved before they were recorded.
  storageGroup?: string;
  webPubSubGroup?: string;
  functionAppGroup?: string;
};

export interface UseBackendPartParams extends AzureTarget {
  location: string; // The card's region, shared by every part.
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

export interface UseBackendPart extends Pick<CardHook, "done"> {
  provisioning: ProvisionModule; // This part's tasks, for a card that runs several parts as one graph.
  runProblem: SetupStep | null; // Why a run can't start yet (GitHub target or a name Azure would reject).
  creationAccess: CardResourceAccess;
  storage: ResourceName; // Sessions and the Function App's deployments.
  webPubSub: ResourceName;
  functionApp: ResourceName;
  appInsightsName: string;
  pipelineAppName: string;
  result: RemoteTerminalInfraResult | null;
  resultMatches: boolean;
  runNonce: number;
}

/*
 * The relay the stage-card terminal runs on: Web PubSub, the session table, and the Function App
 * that issues group-scoped tokens. Mirrors web/deploy-remote-terminal/env, built from the browser
 * instead of Terraform. Every connection is managed identity — nothing here stores a key.
 */
export function useBackendPart({
  azureAccount,
  subscriptionId,
  variableValues,
  tenantId,
  location,
  allowedOrigins,
  githubAccount,
  githubRepo,
  githubRepoId,
  githubEnvName,
}: UseBackendPartParams): UseBackendPart {
  const [result, setResult] = useState<RemoteTerminalInfraResult | null>(null);
  const [runNonce, setRunNonce] = useState(0);

  const resourceGroupName = PRIVATE_RESOURCE_GROUP;
  const lawName = PRIVATE_LOG_ANALYTICS;
  const appInsightsName = PRIVATE_APP_INSIGHTS;
  const nameTarget = { azureAccount, subscriptionId, tenantId, location };
  const storage = useResourceName(nameTarget, STORAGE_NAME, variableValues.API_STORAGE_ACCOUNT || getApiStorageAccountName(subscriptionId));
  // The saved endpoint already names the instance, so a custom name survives a reload without a variable of its own.
  const savedWebPubSub = variableValues.WEBPUBSUB_ENDPOINT?.replace(/\.webpubsub\.azure\.com\/?$/i, "");
  const webPubSub = useResourceName(nameTarget, WEB_PUBSUB_NAME, savedWebPubSub || getWebPubSubName(subscriptionId));
  const functionApp = useResourceName(nameTarget, FUNCTION_APP_NAME, functionAppFromApiUrl(variableValues.VITE_API_URL) || getFunctionAppName(subscriptionId));
  const storageAccountName = storage.name;
  const webPubSubName = webPubSub.name;
  const functionAppName = functionApp.name;
  const planName = `${functionAppName}-plan`;
  const creationAccess = useCardResourceAccess({ azureAccount, subscriptionId, tenantId }, remoteTerminalInfraAccess({
    resourceGroup: resourceGroupName, workspace: lawName, storageAccount: storageAccountName,
    appInsights: appInsightsName, webPubSub: webPubSubName, functionApp: functionAppName, servicePlan: planName,
  }));
  const { reportFailure: reportAccessFailure } = creationAccess;
  const pipelineAppName = PRIVATE_PIPELINE_APP;

  const resultMatches = !!result && result.subscriptionId === subscriptionId;
  const done = DEPLOYMENT_TERMINAL_KEYS.every((key) => !!variableValues[key]);

  const provisioning = useMemo<ProvisionModule>(() => ({
    id: "remote_terminal_infra",
    label: "Backend infrastructure",
    onTaskError: onForbidden(reportAccessFailure),
    onComplete: (output) => {
      const groupOf = (key: string) => output<{ group: string }>(key).group;
      const finished: RemoteTerminalInfraResult = {
        subscriptionId,
        apiUrl: `https://${functionAppName}.azurewebsites.net`,
        webPubSubHost: `${webPubSubName}.webpubsub.azure.com`,
        hubName: TERMINAL_HUB,
        pipelineClientId: output<{ appId: string }>("pipelineApp").appId,
        pipelineTenantId: tenantId || (azureAccount?.tenantId ?? ""),
        appInsightsConnectionString: output<string>("appins"),
        storageAccountName,
        storageGroup: groupOf("storage"),
        webPubSubGroup: groupOf("wps"),
        functionAppGroup: groupOf("plan"),
      };
      setResult(finished);
      setRunNonce((n) => n + 1);
    },
    tasks: backendPart({
      azureAccount, subscriptionId, tenantId, location, resourceGroupName, lawName, appInsightsName, storageAccountName,
      webPubSubName, functionAppName, planName, pipelineAppName, allowedOrigins, githubAccount, githubRepo, githubRepoId, githubEnvName,
    }),
  }), [
    allowedOrigins, appInsightsName, azureAccount, reportAccessFailure, functionAppName, lawName, location, planName, resourceGroupName,
    githubAccount, githubEnvName, githubRepo, githubRepoId, pipelineAppName, storageAccountName, subscriptionId, tenantId, webPubSubName,
  ]);

  const runProblem = backendRunProblem({ githubAccount, githubRepo, githubRepoId, githubEnvName, storageAccountName, functionAppName, webPubSubName });


  return {
    creationAccess,
    provisioning,
    runProblem,
    done,
    result,
    resultMatches,
    runNonce,
    storage,
    webPubSub,
    functionApp,
    appInsightsName,
    pipelineAppName,
  };
}

type RunTarget = {
  githubAccount: Account | null;
  githubRepo: string;
  githubRepoId: number | null;
  githubEnvName: string | null;
  storageAccountName: string;
  functionAppName: string;
  webPubSubName: string;
};

// The checks a backend run makes before any request, as the one error step it shows.
function backendRunProblem({ githubAccount, githubRepo, githubRepoId, githubEnvName, storageAccountName, functionAppName, webPubSubName }: RunTarget): SetupStep | null {
  if (!githubAccount || !githubRepo || githubRepoId === null || !githubEnvName) {
    return {
      id: "github",
      label: "Check the GitHub repository",
      status: "error",
      detail: "Select the GitHub account, repository and environment first — the OIDC credential is scoped to them",
    };
  }
  const nameError = (detail: string): SetupStep => ({ id: "name", label: "Check resource names", status: "error", detail });
  if (!STORAGE_NAME.pattern.test(storageAccountName)) return nameError(`"${storageAccountName}" can't be a storage account name (3-24 lowercase letters and digits) — edit it above`);
  if (!FUNCTION_APP_NAME.pattern.test(functionAppName)) return nameError(`"${functionAppName}" can't be a Function App name (2-60 lowercase letters, digits and hyphens) — edit it above`);
  if (!WEB_PUBSUB_NAME.pattern.test(webPubSubName)) return nameError(`"${webPubSubName}" can't be a Web PubSub name (3-63 lowercase letters, digits and hyphens) — edit it above`);
  return null;
}
