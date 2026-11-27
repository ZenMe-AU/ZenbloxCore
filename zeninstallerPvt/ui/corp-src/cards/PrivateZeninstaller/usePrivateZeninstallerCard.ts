/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { fetchArtifactZip, fetchStageReport, triggerWorkflow } from "../../api";
import {
  deployZipToFunctionApp,
  fetchDeployedBackend,
  findFunctionAppGroup,
  getStaticWebsiteUrl,
  updateFunctionAppSettings,
  type DeployedBackend,
} from "../../api/azureArm";
import { ensureStaticSiteDataReadAccess, readDeployedSite, recordDeployedSite, uploadStaticSite, type DeployedSite } from "../../api/azureBlob";
import { PRIVATE_RESOURCE_GROUP, functionAppFromApiUrl, getFunctionAppName, getWebStorageAccountName } from "../../logic/naming";
import { getDeployCardPresentation, shouldReportBuildFailure, type BuildFailureReport, type DeployCardPresentation } from "../../logic/buildStatus";
import { getAzureAccessFailureKind } from "../../logic/azureAccessFailure";
import { BACKEND_VERSION_KEYS } from "../../config/azureConfig";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import { zeninstallerPvtAccess } from "./config";
import type { Account, AzureAccount, CardHook, CardRequirements, GhEnv, SetupStep } from "../../types";

export const BACKEND_BUILD_WORKFLOW = "buildBackend.yml";
export const WEB_BUILD_WORKFLOW = "buildFrontend.yml";

// The build takes a couple of minutes; these are the gaps between checks for its report.
const POLL_DELAYS_MS = [30_000, 30_000, 45_000, 60_000, 60_000, 90_000];

export interface DeployTarget {
  azureAccount: AzureAccount | null;
  subscriptionId: string;
  tenantId?: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variableValues: Record<string, string>;
}

// ─── Backend ──────────────────────────────────────────────────────────────────

// What the build workflow recorded, as the card reads it back off the Deployments API.
type BackendBuild = {
  version: string;
  sha: string;
  runId: string;
  artifactId: number | null;
  artifactUrl?: string;
  builtAt: number;
};

export interface UseBackendDeployCardParams extends DeployTarget {
  appName: string;
  managementAccess: CardResourceAccess; // Checked once by the card for both deploys.
}

export interface UseBackendDeployCard extends Pick<CardHook, "done" | "status" | "summary">, Omit<DeployCardPresentation, "status" | "summary"> {
  // Its retry also re-reads the deployed version, which the access check can block.
  managementAccess: CardResourceAccess;
  steps: SetupStep[];
  running: boolean;
  run: () => Promise<void>;
  latest: BackendBuild | null;
  deployed: DeployedBackend | null;
  loadingDeployed: boolean;
  deployedUnavailable: boolean;
  loadingLatest: boolean;
  building: boolean;
  build: () => Promise<void>;
  updateAvailable: boolean;
  error: string | null;
  // Identifies the run to open when the latest build attempt failed.
  failedBuildRunId: string | null;
}

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
  appName,
  managementAccess,
}: UseBackendDeployCardParams): UseBackendDeployCard {
  const { steps, setSteps, running, setRunning, updateStep } = useStepRunner();
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
      if (getAzureAccessFailureKind(e) !== "request") reportAccessFailure(e);
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
      await triggerWorkflow(githubAccount, repoName, BACKEND_BUILD_WORKFLOW, selectedEnv.name, selectedEnv.name);
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
      if (getAzureAccessFailureKind(e) !== "request") reportAccessFailure(e);
      setError({ message, summary: "Deployment error" });
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error", detail: message } : s)));
    } finally {
      setRunning(false);
    }
  }, [azureAccount, githubAccount, repoName, latest, subscriptionId, appName, tenantId, findGroup, readDeployed, setRunning, setSteps, updateStep, checkResourceAccess, reportAccessFailure]);

  // Compared on version
  const done = !!deployed && !!latest && deployed.version === latest.version;
  const updateAvailable = !!latest && !done;

  const checking = loadingLatest || loadingDeployed;
  // Loading and errors outrank version comparison, which can otherwise present an outdated ready/deployed state.
  const presentation = getDeployCardPresentation({
    ready, errorSummary: error?.summary, access: managementAccess,
    busySummary: building ? "Building backend" : running ? "Deploying backend" : checking ? "Checking build and deployment" : undefined,
    done, doneSummary: `Deployed ${latest?.sha.slice(0, 7)}`, updateAvailable, buildSummary: "Build the backend", versionUnavailable: deployedUnavailable,
  });

  return {
    managementAccess: {
      ...managementAccess,
      retry: () => {
        managementAccess.retry();
        void readDeployed();
      },
    },
    latest,
    deployed,
    loadingDeployed,
    deployedUnavailable,
    loadingLatest,
    building,
    build,
    updateAvailable,
    error: error?.message ?? null,
    failedBuildRunId: error?.runId ?? null,
    steps,
    running,
    done,
    ...presentation,
    run,
  };
}

// ─── Frontend ─────────────────────────────────────────────────────────────────

// What the build workflow recorded, as the card reads it back off the Deployments API.
type WebBuild = {
  version: string;
  sha: string;
  runId: string;
  artifactId: number | null;
  builtAt: number;
  // What the workflow baked in, so drift since then is visible without rebuilding to find out.
  vars?: Record<string, string>;
};

export interface UseWebDeployCardParams extends DeployTarget {
  storageAccountName: string;
  managementAccess: CardResourceAccess; // Checked once by the card for both deploys.
}

export interface UseWebDeployCard extends Pick<CardHook, "done" | "status" | "summary">, Omit<DeployCardPresentation, "status" | "summary"> {
  steps: SetupStep[];
  running: boolean;
  run: () => Promise<void>;
  siteUrl: string | null;
  latest: WebBuild | null;
  deployed: DeployedSite | null;
  loadingDeployed: boolean;
  loadingLatest: boolean;
  building: boolean;
  build: () => Promise<void>;
  updateAvailable: boolean;
  // Lets the card link directly to the failed workflow run when one is current.
  failedBuildRunId: string | null;
  // The built site bakes this in, so a build without it ships a broken sign-in.
  missingGithubClientId: boolean;
  // Variables whose value no longer matches what the latest build used.
  staleVariables: string[];
  error: string | null;
}

/*
 * The frontend half of Private Zeninstaller Backend: the workflow builds the site, this card
 * downloads that artifact and writes the files into the $web container itself. What is live is
 * kept on the container's metadata, so a build already up there is not uploaded twice.
 */
export function useWebDeployCard({
  azureAccount,
  subscriptionId,
  tenantId,
  githubAccount,
  repoName,
  selectedEnv,
  variableValues,
  storageAccountName,
  managementAccess,
}: UseWebDeployCardParams): UseWebDeployCard {
  const { steps, setSteps, running, setRunning, updateStep } = useStepRunner();
  const [latest, setLatest] = useState<WebBuild | null>(null);
  const [deployed, setDeployed] = useState<DeployedSite | null>(null);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [loadingDeployed, setLoadingDeployed] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [building, setBuilding] = useState(false);
  // Keep a short header summary and run link with the detailed error shown in the card body.
  const [error, setError] = useState<{ message: string; summary: string; runId?: string } | null>(null);
  const [lastFailure, setLastFailure] = useState<BuildFailureReport | null>(null);

  const { check: checkResourceAccess, reportFailure: reportAccessFailure } = managementAccess;
  const missingGithubClientId = !(variableValues.VITE_GITHUB_CLIENT_ID ?? "").trim();
  const ready = !!azureAccount && !!githubAccount && !!repoName && !!selectedEnv;

  const readLatest = useCallback(async () => {
    if (!githubAccount || !repoName || !selectedEnv) return null;
    // Keep the last successful artifact separate from failure reports so a failed run cannot erase it.
    const [report, failure] = await Promise.all([
      fetchStageReport(githubAccount, repoName, selectedEnv.name, "frontend", "build"),
      fetchStageReport(githubAccount, repoName, selectedEnv.name, "frontend-failure", "build"),
    ]);
    return {
      build: (report?.stage as unknown as WebBuild) ?? null,
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
            setError({ message: "The frontend build failed. Check the workflow run in GitHub.", summary: "Build error", runId: reports.failure.runId });
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
    if (!azureAccount || !storageAccountName || !subscriptionId) return;
    setLoadingDeployed(true);
    try {
      // Before the environment card runs there is no account to ask, which is not an error here.
      const url = await getStaticWebsiteUrl(azureAccount, subscriptionId, storageAccountName, tenantId);
      setSiteUrl(url);
      setDeployed(url ? await readDeployedSite(azureAccount, storageAccountName, tenantId) : null);
    } catch (e) {
      if (getAzureAccessFailureKind(e) !== "request") reportAccessFailure(e);
      else setError({ message: e instanceof Error ? e.message : "Could not read what is live", summary: "Deployment error" });
    } finally {
      setLoadingDeployed(false);
    }
  }, [azureAccount, subscriptionId, storageAccountName, tenantId, reportAccessFailure]);

  // Deferred so the loading flag is not set during the render that schedules this.
  useEffect(() => {
    const t = setTimeout(() => void readDeployed(), 0);
    return () => clearTimeout(t);
  }, [readDeployed]);

  const build = useCallback(async () => {
    if (!githubAccount || !repoName || !selectedEnv) return;
    setBuilding(true);
    setError(null);
    const before = latest?.builtAt ?? 0;
    try {
      await triggerWorkflow(githubAccount, repoName, WEB_BUILD_WORKFLOW, selectedEnv.name, selectedEnv.name);
      for (const delay of POLL_DELAYS_MS) {
        await new Promise((r) => setTimeout(r, delay));
        const reports = await readLatest();
        // Stop as soon as this attempt fails; otherwise accept only a build newer than the one we started with.
        if (reports?.failure && shouldReportBuildFailure(reports.failure, lastFailure, reports.build, reports.buildReportedAt)) {
          setLastFailure(reports.failure);
          setError({ message: "The frontend build failed. Check the workflow run in GitHub.", summary: "Build error", runId: reports.failure.runId });
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
    if (!azureAccount || !githubAccount || !repoName || !latest || !storageAccountName || missingGithubClientId) return;
    if (latest.artifactId == null) {
      setError({ message: "The latest build did not publish a site artifact.", summary: "Build error" });
      return;
    }
    setRunning(true);
    setError(null);
    setSteps([
      { id: "access", label: "Check Azure resource and storage read access", status: "pending" },
      { id: "download", label: "Download the built site", status: "pending" },
      { id: "unpack", label: "Unpack it", status: "pending" },
      { id: "upload", label: `Upload it to ${storageAccountName}`, status: "pending" },
    ]);
    try {
      updateStep("access", "running");
      await checkResourceAccess();
      await ensureStaticSiteDataReadAccess(azureAccount, storageAccountName, tenantId).catch((e: unknown) => {
        reportAccessFailure(e);
        throw e;
      });
      updateStep("access", "done", "Storage read checked; upload permission is enforced during upload.");
      updateStep("download", "running");
      const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);
      const zip = await fetchArtifactZip(githubAccount, repoName, latest.artifactId, (received, total) =>
        updateStep("download", "running", total ? `${mb(received)} / ${mb(total)} MB` : `${mb(received)} MB`, total ? received / total : undefined)
      );
      updateStep("download", "done", `${mb(zip.size)} MB`);

      updateStep("unpack", "running");
      const archive = await JSZip.loadAsync(zip);
      const files = await Promise.all(
        Object.values(archive.files)
          .filter((f) => !f.dir)
          .map(async (f) => ({ path: f.name, body: await f.async("blob") }))
      );
      if (files.length === 0) throw new Error("The artifact contained no files");
      updateStep("unpack", "done", `${files.length} files`);

      updateStep("upload", "running");
      await uploadStaticSite(azureAccount, storageAccountName, files, tenantId, (uploaded, total) =>
        updateStep("upload", "running", `${uploaded} / ${total} files`, uploaded / total)
      );
      updateStep("upload", "done", `${files.length} files`);

      // Recorded on the container rather than in this browser, so any machine sees what is live.
      await recordDeployedSite(azureAccount, storageAccountName, { version: latest.version, sha: latest.sha, builtAt: latest.builtAt }, tenantId);
      await readDeployed();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError({ message, summary: "Deployment error" });
      if (getAzureAccessFailureKind(e) !== "request") reportAccessFailure(e);
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error", detail: message } : s)));
    } finally {
      setRunning(false);
    }
  }, [azureAccount, githubAccount, repoName, latest, storageAccountName, tenantId, readDeployed, setRunning, setSteps, updateStep, checkResourceAccess, reportAccessFailure, missingGithubClientId]);

  // Compared on version
  const staleVariables = Object.entries(latest?.vars ?? {})
    .filter(([key, builtWith]) => (variableValues[key] ?? "") !== builtWith)
    .map(([key]) => key);

  const done = !!deployed && !!latest && deployed.version === latest.version;
  const updateAvailable = !!latest && !done;

  const checking = loadingLatest || loadingDeployed;
  // Keep the header aligned with the actual operation instead of leaving a stale warning during work or failure.
  const presentation = getDeployCardPresentation({
    ready, errorSummary: error?.summary, inputWarning: missingGithubClientId ? "VITE_GITHUB_CLIENT_ID not set" : undefined,
    access: managementAccess,
    busySummary: building ? "Building frontend" : running ? "Deploying frontend" : checking ? "Checking build and deployment" : undefined,
    done, doneSummary: `Deployed ${latest?.sha.slice(0, 7)}`, updateAvailable, buildSummary: "Build the frontend",
  });

  return {
    siteUrl,
    latest,
    deployed,
    loadingDeployed,
    loadingLatest,
    building,
    build,
    updateAvailable,
    failedBuildRunId: error?.runId ?? null,
    missingGithubClientId,
    staleVariables,
    error: error?.message ?? null,
    steps,
    running,
    done,
    ...presentation,
    run,
  };
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface UsePrivateZeninstallerCard extends CardHook {
  readonly cardId: "private_zeninstaller";
  managementAccess: CardResourceAccess;
  appName: string;
  storageAccountName: string;
  backend: UseBackendDeployCard;
  web: UseWebDeployCard;
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

// Checks Azure access for both deploys up front, then each section only builds and deploys its own part.
export function usePrivateZeninstallerCard(target: DeployTarget): UsePrivateZeninstallerCard {
  const { azureAccount, subscriptionId, tenantId, variableValues } = target;
  const appName = functionAppFromApiUrl(variableValues.VITE_API_URL) || getFunctionAppName(subscriptionId);
  const storageAccountName = variableValues.SITE_STORAGE_ACCOUNT || getWebStorageAccountName(subscriptionId);
  const managementAccess = useCardResourceAccess({ azureAccount, subscriptionId, tenantId }, zeninstallerPvtAccess(storageAccountName, appName));
  const backend = useBackendDeployCard({ ...target, appName, managementAccess });
  const web = useWebDeployCard({ ...target, storageAccountName, managementAccess });
  // The header speaks for a failed section first, otherwise for the first one not yet deployed.
  const pending = [backend, web].find((section) => section.status === "error") ?? [backend, web].find((section) => !section.done);

  return {
    cardId: "private_zeninstaller",
    managementAccess,
    appName,
    storageAccountName,
    backend,
    web,
    done: !pending,
    status: pending?.status ?? "complete",
    summary: pending?.summary ?? "Deployed",
    cardRequirements: ["github_login", "repo", "azure_login", "core_infra"],
    cardDependencyLabel: "Deploy Private Zeninstaller",
  };
}
