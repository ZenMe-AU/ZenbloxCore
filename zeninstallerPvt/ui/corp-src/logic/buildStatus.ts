/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardStatus } from "../types";
import type { SubscriptionAccess } from "../hooks/util/useAzureAccessCheck";

export type BuildFailureReport = { runId: string; reportedAt: number };

// Prefer missing prerequisites, errors, and active work over a possibly stale version comparison.
export function getDeployCardStatus({ ready, hasError, busy, done, hasAccessError = false }: { ready: boolean; hasError: boolean; busy: boolean; done: boolean; hasAccessError?: boolean }): CardStatus {
  if (!ready) return "idle";
  if (hasError) return "error";
  if (hasAccessError) return "warning";
  if (busy) return "loading";
  return done ? "complete" : "warning";
}

export type DeployCardPresentation = {
  status: CardStatus;
  summary: string;
  accessNotice: { summary: string; severity: "warning" | "error" } | null;
  showReady: boolean;
  showCurrent: boolean;
};

export function getDeployCardPresentation({ ready, errorSummary, inputWarning, access, busySummary, done, doneSummary, updateAvailable, buildSummary, versionUnavailable = false }: {
  ready: boolean;
  errorSummary?: string;
  inputWarning?: string;
  access: Pick<SubscriptionAccess, "status" | "failureKind">;
  busySummary?: string;
  done: boolean;
  doneSummary: string;
  updateAvailable: boolean;
  buildSummary: string;
  versionUnavailable?: boolean;
}): DeployCardPresentation {
  const accessNotice: DeployCardPresentation["accessNotice"] = access.status !== "error" ? null
    : access.failureKind === "permission" ? { summary: "Insufficient permissions to deploy", severity: "warning" }
    : access.failureKind === "authentication" ? { summary: "Sign in again to check deployment access", severity: "warning" }
    : { summary: "Unable to verify deployment access", severity: "error" };
  const accessError = accessNotice?.severity === "error";
  const status = getDeployCardStatus({
    ready, hasError: !!errorSummary || accessError, hasAccessError: !!inputWarning || !!accessNotice,
    busy: !!busySummary || access.status !== "ready", done,
  });
  const summary = !ready ? "Unavailable"
    : errorSummary ?? (accessError ? accessNotice.summary : undefined)
      ?? inputWarning ?? accessNotice?.summary ?? busySummary
      ?? (access.status !== "ready" ? "Checking deployment access" : done ? doneSummary : updateAvailable ? "Ready to deploy the new build" : buildSummary);
  const showVersionGuidance = ready && !errorSummary && !inputWarning && access.status === "ready" && !busySummary && !versionUnavailable;
  return { status, summary, accessNotice, showReady: showVersionGuidance && updateAvailable, showCurrent: showVersionGuidance && done };
}

// Ignore an old failure when a newer success exists; run IDs break ties when reports share a timestamp.
export function shouldReportBuildFailure(
  failure: BuildFailureReport,
  previousFailure: BuildFailureReport | null,
  latestBuild: { runId: string } | null,
  latestBuildReportedAt: number
): boolean {
  if (previousFailure && failure.reportedAt < previousFailure.reportedAt) return false;
  if (previousFailure && failure.reportedAt === previousFailure.reportedAt && failure.runId === previousFailure.runId) return false;
  if (failure.reportedAt !== latestBuildReportedAt) return failure.reportedAt > latestBuildReportedAt;
  if (!latestBuild) return true;
  // Deployment timestamps have one-second precision, so compare run IDs for same-second reports.
  return /^\d+$/.test(failure.runId) && /^\d+$/.test(latestBuild.runId) && BigInt(failure.runId) >= BigInt(latestBuild.runId);
}