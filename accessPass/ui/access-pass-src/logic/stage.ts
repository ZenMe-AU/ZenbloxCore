import type {
  CardStatus,
  PlanSummary,
  Prerequisite,
  PrerequisiteStageVar,
  PrerequisiteVar,
  PrerequisiteVarGroup,
  Stage,
  StageStatus,
} from "../../access-pass-src/types";

// ─── Pure domain functions for stage business logic ───────────────────────────

/** True when a plan has zero resource changes. */
export function isNoChanges(summary?: PlanSummary): boolean {
  return summary != null && summary.create === 0 && summary.update === 0 && summary.delete === 0 && summary.replace === 0;
}

/**
 * Effective stage status, enforcing priority:
 *  1. deployStatus === "success"  → "deployed"
 *  2. noChanges                   → "deployed"
 *  3. optional + pending          → "skipped"
 *  4. raw stage status
 */
export function getEffectiveStatus(stage: Stage, summary?: PlanSummary, isOptional?: boolean): StageStatus {
  if (stage.deployPlanRunId && stage.runId && stage.deployPlanRunId === stage.runId) return "deployed";
  if (isNoChanges(summary)) return "deployed";
  if (isOptional && stage.status === "pending") return "skipped";
  return stage.status;
}

/** Map effective stage status + stale/loading flags to a CardStatus for the pipeline card. */
export function stageToCardStatus(
  effectiveStatus: StageStatus,
  isStale: boolean,
  isLoading: boolean,
): CardStatus {
  if (isStale) return "idle";
  if (isLoading) return "loading";
  if (effectiveStatus === "deployed") return "complete";
  if (effectiveStatus === "success") return "loading";
  if (effectiveStatus === "failed") return "error";
  if (effectiveStatus === "skipped") return "skipped";
  return "idle";
}

/**
 * True when any prerequisite variable differs between the current live values
 * and the deployed environment snapshot.
 */
export function hasVariableDiff(
  prerequisites: Prerequisite[],
  currentVars: Record<string, string>,
  deployedEnv: Record<string, string>,
): boolean {
  return prerequisites.some((p) => {
    if (p.type === "var")
      return (currentVars[(p as PrerequisiteVar).key] ?? "") !== (deployedEnv[(p as PrerequisiteVar).key] ?? "");
    if (p.type === "varGroup" || p.type === "stageVar")
      return (p as PrerequisiteVarGroup | PrerequisiteStageVar).keys.some(
        (k) => (currentVars[k] ?? "") !== (deployedEnv[k] ?? ""),
      );
    return false;
  });
}

/**
 * True when the polled status file hasn't been updated by the workflow
 * that was just triggered.
 *
 * @param triggerTime    Date.now() value (milliseconds) when the user clicked Run
 * @param fileUpdatedAt  Timestamp from the status file, already converted to ms
 * @param fetchedRunId   runId in the latest fetched status file
 * @param prevRunId      runId that was present before triggering
 */
export function isPlanStale(
  triggerTime: number,
  fileUpdatedAt: number | null,
  fetchedRunId: string | null,
  prevRunId: string | null,
): boolean {
  const timeStale = fileUpdatedAt === null || triggerTime > fileUpdatedAt;
  const runIdStale = prevRunId !== null && fetchedRunId !== null && fetchedRunId === prevRunId;
  return timeStale || runIdStale;
}
