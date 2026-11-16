/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArtifactZip, fetchStageReport, triggerWorkflow } from "../../api";
import {
  deployZipToFunctionApp,
  fetchDeployedBackend,
  findFunctionAppGroup,
  updateFunctionAppSettings,
  type DeployedBackend,
} from "../../api/azureArm";
import { PRIVATE_RESOURCE_GROUP, functionAppFromApiUrl, getFunctionAppName } from "../../logic/naming";
import { getDeployCardStatus, shouldReportBuildFailure, type BuildFailureReport } from "../../logic/buildStatus";
import { BACKEND_VERSION_KEYS } from "../../config/azureConfig";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import type { Account, AzureAccount, AzureConfigHook, CardHook, CardRequirements, GhEnv } from "../../types";

// What the build workflow recorded, as the card reads it back off the Deployments API.
type BackendBuild = {
  version: string;
  sha: string;
  runId: string;
  artifactId: number | null;
  artifactUrl?: string;
  builtAt: number;
};

export interface UseBackendDeployCardParams {
  azureAccount: import("../../types").AzureAccount | null;
  subscriptionId: string;
  tenantId?: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variableValues: Record<string, string>;
}

const BUILD_WORKFLOW = "buildBackend.yml";

export interface UseBackendDeployCard extends CardHook, AzureConfigHook {
  managementAccess: CardResourceAccess;
  readonly cardId: "backend_deploy";
  appName: string;
  latest: BackendBuild | null;
  deployed: DeployedBackend | null;
  loadingDeployed: boolean;
  deployedUnavailable: boolean;
  loadingLatest: boolean;
  building: boolean;
  build: () => Promise<void>;
  buildWorkflow: string;
  updateAvailable: boolean;
  error: string | null;
  // Identifies the run to open when the latest build attempt failed.
  failedBuildRunId: string | null;
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

// The build takes a couple of minutes; these are the gaps between checks for its report.
const POLL_DELAYS_MS = [30_000, 30_000, 45_000, 60_000, 60_000, 90_000];

/*
 * Publishes the corp backend to the terminal relay's Function App: the workflow builds a package,
 * this card downloads that artifact and pushes it to Kudu itself. The sha of what was pushed is
 * remembered, so a package that is already live is not uploaded twice.
 */
export function useBackendDeployCard({
  azureAccount,
  subscriptionId,
  tenantId,
  githubAccount,
  repoName,
  selectedEnv,
  variableValues,
}: UseBackendDeployCardParams): UseBackendDeployCard {
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const [latest, setLatest] = useState<BackendBuild | null>(null);
  const [deployed, setDeployed] = useState<DeployedBackend | null>(null);
  const [loadingDeployed, setLoadingDeployed] = useState(false);
  const [deployedUnavailable, setDeployedUnavailable] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [building, setBuilding] = useState(false);
  // Keep the summary and run ID with the message so card status and its GitHub link describe the same error.
  const [error, setError] = useState<{ message: string; summary: string; runId?: string } | null>(null);
  // Remember the observed failure so polling can distinguish a new failure from the previous report.
  const [lastFailure, setLastFailure] = useState<BuildFailureReport | null>(null);
  const deployedReadSequence = useRef(0);

  // The same name the Backend Environment card created; where it lives is asked of Azure, since it may be reused elsewhere.
  const appName = functionAppFromApiUrl(variableValues.VITE_API_URL) || getFunctionAppName(subscriptionId);
  const managementAccess = useCardResourceAccess({ azureAccount, subscriptionId, tenantId }, {
    card: "backendDeploy", resourceGroup: PRIVATE_RESOURCE_GROUP, functionApp: appName,
  });
  const { check: checkResourceAccess, reportFailure: reportAccessFailure } = managementAccess;
  const findGroup = useCallback(
    async (account: AzureAccount) => (await findFunctionAppGroup(account, subscriptionId, appName, tenantId || undefined)) ?? PRIVATE_RESOURCE_GROUP,
    [subscriptionId, appName, tenantId]
  );
  const ready = !!azureAccount && !!githubAccount && !!repoName && !!selectedEnv;

  const readLatest = useCallback(async () => {
    if (!githubAccount || !repoName || !selectedEnv) return null;
    // Read both task-specific reports so an unsuccessful run is visible without discarding the last usable artifact.
    const [report, failure] = await Promise.all([
      fetchStageReport(githubAccount, repoName, selectedEnv.name, "backend", "build"),
      fetchStageReport(githubAccount, repoName, selectedEnv.name, "backend-failure", "build"),
    ]);
    return {
      build: (report?.stage as unknown as BackendBuild) ?? null,
      buildReportedAt: report?.createdAt ?? 0,
      failure: failure ? { runId: (failure.stage as unknown as { runId: string }).runId, reportedAt: failure.createdAt } : null,
    };
  }, [githubAccount, repoName, selectedEnv]);

  useEffect(() => {
    if (!githubAccount || !repoName || !selectedEnv) return;
    let cancelled = false;
    void (async () => {
      setLoadingLatest(true);
      try {
        const reports = await readLatest();
        if (!cancelled && reports) {
          setLatest(reports.build);
          setLastFailure(reports.failure);
          if (reports.failure && shouldReportBuildFailure(reports.failure, null, reports.build, reports.buildReportedAt)) {
            setError({ message: "The backend build failed. Check the workflow run in GitHub.", summary: "Build error", runId: reports.failure.runId });
          }
        }
      } catch (e) {
        if (!cancelled) setError({ message: e instanceof Error ? e.message : "Could not read the latest build", summary: "Build status unavailable" });
      } finally {
        if (!cancelled) setLoadingLatest(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [githubAccount, repoName, selectedEnv, readLatest]);

  const readDeployed = useCallback(async () => {
    if (!azureAccount || !appName || !subscriptionId) {
      setLoadingDeployed(false);
      return;
    }
    const sequence = ++deployedReadSequence.current;
    setLoadingDeployed(true);
    try {
      const current = await fetchDeployedBackend(azureAccount, subscriptionId, await findGroup(azureAccount), appName, tenantId || undefined);
      if (sequence !== deployedReadSequence.current) return;
      setDeployed(current);
      setDeployedUnavailable(false);
    } catch (e) {
      if (sequence !== deployedReadSequence.current) return;
      setDeployedUnavailable(true);
      const message = { message: e instanceof Error ? e.message : "Could not read the deployed version", summary: "Deployment error" };
      if (/^403 \/subscriptions\//.test(message)) reportAccessFailure(e);
      else setError(message);
    } finally {
      if (sequence === deployedReadSequence.current) setLoadingDeployed(false);
    }
  }, [azureAccount, subscriptionId, appName, tenantId, findGroup, reportAccessFailure]);

  // Deferred so the loading flag is not set during the render that schedules this.
  useEffect(() => {
    const sequence = deployedReadSequence;
    const t = setTimeout(() => void readDeployed(), 0);
    return () => {
      clearTimeout(t);
      sequence.current++;
    };
  }, [readDeployed]);

  const build = useCallback(async () => {
    if (!githubAccount || !repoName || !selectedEnv) return;
    setBuilding(true);
    setError(null);
    const before = latest?.builtAt ?? 0;
    try {
      await triggerWorkflow(githubAccount, repoName, BUILD_WORKFLOW, selectedEnv.name, selectedEnv.name);
      for (const delay of POLL_DELAYS_MS) {
        await new Promise((r) => setTimeout(r, delay));
        const reports = await readLatest();
        // A newly recorded failure completes the poll immediately; don't wait out every remaining interval.
        if (reports?.failure && shouldReportBuildFailure(reports.failure, lastFailure, reports.build, reports.buildReportedAt)) {
          setLastFailure(reports.failure);
          setError({ message: "The backend build failed. Check the workflow run in GitHub.", summary: "Build error", runId: reports.failure.runId });
          return;
        }
        if (reports?.build && reports.build.builtAt > before) {
          setLatest(reports.build);
          return;
        }
      }
      setError({ message: "The build is taking longer than expected — check GitHub Actions.", summary: "Build status unavailable" });
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Failed to start the build", summary: "Build error" });
    } finally {
      setBuilding(false);
    }
  }, [githubAccount, repoName, selectedEnv, latest, readLatest, lastFailure]);

  const run = useCallback(async () => {
    if (!azureAccount || !githubAccount || !repoName || !latest || !appName) return;
    if (latest.artifactId == null) {
      setError({ message: "The latest build did not publish a package artifact.", summary: "Build error" });
      return;
    }
    setRunning(true);
    setError(null);
    setSteps([
      { id: "access", label: "Check Azure resource access", status: "pending" },
      { id: "download", label: "Download the built package", status: "pending" },
      { id: "upload", label: `Upload it to ${appName}`, status: "pending" },
      { id: "deploy", label: "Wait for the Function App to unpack it", status: "pending" },
    ]);
    try {
      updateStep("access", "running");
      await checkResourceAccess();
      updateStep("access", "done");
      updateStep("download", "running");
      const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);
      const zip = await fetchArtifactZip(githubAccount, repoName, latest.artifactId, (received, total) =>
        updateStep(
          "download",
          "running",
          total ? `${mb(received)} / ${mb(total)} MB` : `${mb(received)} MB`,
          // Undefined without a Content-Length, which leaves the row with text but no bar.
          total ? received / total : undefined
        )
      );
      updateStep("download", "done", `${mb(zip.size)} MB`);

      const resourceGroup = await findGroup(azureAccount);
      await deployZipToFunctionApp(azureAccount, subscriptionId, resourceGroup, appName, zip, tenantId, (phase) => {
        if (phase === "uploading") updateStep("upload", "running");
        else {
          updateStep("upload", "done");
          updateStep("deploy", "running");
        }
      });
      updateStep("deploy", "done");

      // Recorded on the app rather than in this browser, so any machine can see what is live.
      await updateFunctionAppSettings(
        azureAccount,
        subscriptionId,
        resourceGroup,
        appName,
        {
          [BACKEND_VERSION_KEYS.version]: latest.version,
          [BACKEND_VERSION_KEYS.sha]: latest.sha,
          [BACKEND_VERSION_KEYS.builtAt]: String(latest.builtAt),
        },
        tenantId || undefined
      );
      await readDeployed();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/^403 \/subscriptions\//.test(message)) reportAccessFailure(e);
      else setError({ message, summary: "Deployment error" });
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error", detail: message } : s)));
    } finally {
      setRunning(false);
    }
  }, [azureAccount, githubAccount, repoName, latest, subscriptionId, appName, tenantId, findGroup, readDeployed, setRunning, setSteps, updateStep, checkResourceAccess, reportAccessFailure]);

  const reset = useCallback(() => {
    resetSteps();
    setError(null);
    void readDeployed();
  }, [resetSteps, readDeployed]);

  // Compared on version
  const done = !!deployed && !!latest && deployed.version === latest.version;
  const updateAvailable = !!latest && !done;

  const checking = loadingLatest || loadingDeployed;
  // Loading and errors outrank version comparison, which can otherwise present an outdated ready/deployed state.
  const status = getDeployCardStatus({ ready, hasError: !!error, busy: checking || building || running, done, hasAccessError: managementAccess.status === "error" });
  const summary = !ready ? "Unavailable" : managementAccess.status === "error" ? "Insufficient permissions to deploy": error ? error.summary : building ? "Building backend" : running ? "Deploying backend" : checking ? "Checking build and deployment" : done ? `Deployed ${latest?.sha.slice(0, 7)}` : updateAvailable ? "Ready to deploy the new build" : "Build the backend";

  return {
    managementAccess: {
      ...managementAccess,
      retry: () => {
        managementAccess.retry();
        void readDeployed();
      },
    },
    cardId: "backend_deploy" as const,
    appName,
    latest,
    deployed,
    loadingDeployed,
    deployedUnavailable,
    loadingLatest,
    building,
    build,
    buildWorkflow: BUILD_WORKFLOW,
    updateAvailable,
    error: error?.message ?? null,
    failedBuildRunId: error?.runId ?? null,
    steps,
    running,
    done,
    status,
    summary,
    run,
    reset,
    cardRequirements: ["github_login", "repo", "azure_login", "remote_terminal_infra"],
    cardDependencyLabel: "Deploy the backend",
  };
}
