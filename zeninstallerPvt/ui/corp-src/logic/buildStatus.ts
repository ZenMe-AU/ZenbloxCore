/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardStatus } from "../types";

export type BuildFailureReport = { runId: string; reportedAt: number };

// Prefer missing prerequisites, errors, and active work over a possibly stale version comparison.
export function getDeployCardStatus({ ready, hasError, busy, done, hasAccessError = false }: { ready: boolean; hasError: boolean; busy: boolean; done: boolean; hasAccessError?: boolean }): CardStatus {
  if (!ready) return "idle";
  if (hasError) return "error";
  if (hasAccessError) return "warning";
  if (busy) return "loading";
  return done ? "complete" : "warning";
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