/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type {
  ActionType,
  CardId,
  CardStatus,
  PlanItem,
  PlanSummary,
  Prerequisite,
  PrerequisiteStageVar,
  PrerequisiteVar,
  PrerequisiteVarGroup,
  Stage,
  StageReport,
  StageStatus,
} from "../types";
import { getVariableDisplayName } from "./variables";

// The Deployments API types payload as object-or-string, so both shapes have to parse.
export function toStageReport(payload: unknown, createdAt: string, sha?: string): StageReport | null {
  let data: unknown = payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const at = new Date(createdAt).getTime();
  return { stage: data as Stage, createdAt: Number.isNaN(at) ? 0 : at, sha };
}

export function getStageCardId(stageKey: string): CardId {
  return `stage_${stageKey}`;
}

export function getActionType(actions: string[]): ActionType {
  if (actions.includes("delete") && actions.includes("create")) return "replace";
  if (actions.includes("create")) return "create";
  if (actions.includes("delete")) return "delete";
  if (actions.includes("update")) return "update";
  if (actions.includes("no-op")) return "noOp";
  return "unknown";
}

export function computePlanSummary(items: PlanItem[]): PlanSummary {
  return items.reduce(
    (acc, item) => {
      const t = getActionType(item.change.actions);
      if (t === "create") acc.create++;
      if (t === "update") acc.update++;
      if (t === "delete") acc.delete++;
      if (t === "replace") acc.replace++;
      return acc;
    },
    { create: 0, update: 0, delete: 0, replace: 0 }
  );
}

export function isNoChanges(summary?: PlanSummary): boolean {
  return summary != null && summary.create === 0 && summary.update === 0 && summary.delete === 0 && summary.replace === 0;
}

export function getEffectiveStatus(stage: Stage, summary?: PlanSummary, isOptional?: boolean): StageStatus {
  // The deploy records its plan run whatever the outcome, so the status has to be checked too —
  // a failed or cancelled apply must stay "success" and keep offering Deploy.
  if (stage.deployStatus === "success" && stage.deployPlanRunId && stage.runId && stage.deployPlanRunId === stage.runId) return "deployed";
  if (stage.status === "success" && isNoChanges(summary)) return "deployed";
  if (isOptional && stage.status === "pending") return "skipped";
  return stage.status;
}

// A plan produced from an older commit may not reflect what is on the branch now.
export function isPlanBehind(stage: Stage, latestSha?: string): boolean {
  return !!stage.planSha && !!latestSha && stage.planSha !== latestSha;
}

export type PrerequisiteAssessment = {
  missing: string[];
  incomplete: string[];
  changed: string[];
  blocked: boolean;
  summary: string;
};

export function assessPrerequisites(
  prerequisites: Prerequisite[],
  variableValues: Record<string, string>,
  cardStatus: Record<CardId, CardStatus>,
  planEnv: Record<string, string> | null = null,
): PrerequisiteAssessment {
  // Keep edited plan inputs distinct from missing inputs: edits can refresh a plan, but cannot deploy it.
  const missing = new Set<string>();
  const incomplete = new Set<string>();
  const changed = new Set<string>();
  for (const prerequisite of prerequisites) {
    if (prerequisite.type === "card") {
      if (cardStatus[prerequisite.cardId] !== "complete") incomplete.add(prerequisite.cardId);
      continue;
    }
    const keys = prerequisite.type === "var" ? [prerequisite.key] : prerequisite.keys;
    for (const key of keys) {
      const label = getVariableDisplayName(key);
      if (!variableValues[key]?.trim()) missing.add(label);
      else if (planEnv != null && variableValues[key] !== (planEnv[key] ?? "")) changed.add(label);
    }
  }
  const parts = [
    missing.size > 0 ? `${[...missing].join(", ")} not set` : "",
    incomplete.size > 0 ? `${[...incomplete].map((id) => id.replaceAll("_", " ")).join(", ")} not complete` : "",
    changed.size > 0 ? `${[...changed].join(", ")} changed since last plan` : "",
  ].filter(Boolean);
  return { missing: [...missing], incomplete: [...incomplete], changed: [...changed], blocked: parts.length > 0, summary: parts.join("; ") };
}

export function getUnmetPrerequisites(prerequisites: Prerequisite[], variableValues: Record<string, string>, cardStatus: Record<CardId, CardStatus>): string[] {
  const { missing, incomplete } = assessPrerequisites(prerequisites, variableValues, cardStatus);
  return [...missing, ...incomplete];
}

export function getStageSummaryText(stage: Stage, summary: PlanSummary | undefined, loading: boolean, stale: boolean, optional?: boolean, unmetPrerequisites: string[] = []): string {
  const effectiveStatus = getEffectiveStatus(stage, summary, optional);
  // Check prerequisites first
  if (unmetPrerequisites.length > 0) {
    return `${unmetPrerequisites.join(", ")} not set`; // Name the fixable blocker instead of repeating an earlier plan failure.
  }
  // Check if stale
  if (stale) return "Status update required";
  if (loading) return "Loading status...";
  if (stage.status === "success" && isNoChanges(summary)) return "No changes";
  if (effectiveStatus === "success" && stage.runId && stage.deployPlanRunId === stage.runId) {
    if (stage.deployStatus === "failed") return "Failed: Deployment failed; check the GitHub Actions run";
    if (stage.deployStatus === "cancelled") return "Deployment cancelled; retry deployment";
  }
  return (
    {
      deployed: "Deployed",
      success: "Ready to deploy",
      failed: "Plan failed; check the GitHub Actions run", // The message identifies the failure without a redundant "Failed:" prefix.
      pending: "Not yet executed",
      skipped: "Skipped",
    } as Record<StageStatus, string>
  )[effectiveStatus];
}

export function stageToCardStatus(effectiveStatus: StageStatus, isStale: boolean, isLoading: boolean, hasUnmetPrerequisites = false): CardStatus { // Include blockers in the card's warning decision.
  if (hasUnmetPrerequisites) return "warning";
  if (isStale) return "idle";
  if (isLoading) return "loading";
  if (effectiveStatus === "deployed") return "complete";
  if (effectiveStatus === "skipped") return "skipped"; // Optional skipped stages are not actionable warnings.
  if (effectiveStatus === "failed") return "error"; // Keep failed plans red when no outstanding prerequisite takes precedence.
  if (effectiveStatus === "success") return "warning"; // A successful plan awaiting deployment remains an orange warning.
  return "idle";
}

export function hasVariableDiff(prerequisites: Prerequisite[], currentVars: Record<string, string>, deployedEnv: Record<string, string>): boolean {
  return prerequisites.some((p) => {
    if (p.type === "var") return (currentVars[(p as PrerequisiteVar).key] ?? "") !== (deployedEnv[(p as PrerequisiteVar).key] ?? "");
    if (p.type === "varGroup" || p.type === "stageVar")
      return (p as PrerequisiteVarGroup | PrerequisiteStageVar).keys.some((k) => (currentVars[k] ?? "") !== (deployedEnv[k] ?? ""));
    return false;
  });
}
