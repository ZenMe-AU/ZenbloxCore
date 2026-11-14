/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Account, CardChrome, CardHook, CardId, CardStatus, GhEnv, PipelineConfig, PlanSummary, Stage, StageDefinition } from "../../types";
import type { UseDeploymentPlan } from "./useDeploymentPlan";
import { assessPrerequisites, getEffectiveStatus, getStageCardId, getStageSummaryText, stageToCardStatus, type PrerequisiteAssessment } from "../../logic/stage";

export type CorpStageCardModel = {
  key: string;
  card: CardChrome;
  stageDef: StageDefinition;
  stage: Stage;
  prerequisiteAssessment: PrerequisiteAssessment;
  deployDisabled: boolean;
  deployedEnv: Record<string, string> | null;
  variableValues: Record<string, string>;
  cardStatus: Record<CardId, CardStatus>;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  onVariableConfirmed: (key: string, value: string) => void;
  trackDeploy?: () => Promise<void>;
  onPlanSummary: (s: PlanSummary) => void;
  onRunStatusUpdate: () => Promise<void>;
  statusUpdateRunning: boolean;
  statusUpdateCountdown: number;
  statusUpdateDisabled: boolean;
  runError: string | null;
};

export function useCorpStageCards({
  pipeline,
  plan,
  allCards,
  repoDone,
  repoDependencyLabel,
  expandedIds,
  account,
  repoName,
  selectedEnv,
  variableValues,
  onVariableConfirmed,
  onToggle,
  onRequirementClick,
}: {
  pipeline: PipelineConfig;
  plan: UseDeploymentPlan;
  allCards: Record<string, CardHook>;
  repoDone: boolean;
  repoDependencyLabel?: string | null;
  expandedIds: Set<CardId>;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variableValues: Record<string, string>;
  onVariableConfirmed: (key: string, value: string) => void;
  onToggle: (id: CardId) => void;
  onRequirementClick: (id: CardId) => void;
}): CorpStageCardModel[] {
  const cardStatus = Object.fromEntries(Object.entries(allCards).map(([id, hook]) => [id, hook.status])) as Record<CardId, CardStatus>;
  const cardErrorMsg = null;

  return pipeline.stages.map((stageDef: StageDefinition) => {
    const stage = plan.stages.find((s) => s.stage === stageDef.dir) ?? {
      stage: stageDef.dir,
      status: "pending" as const,
    };
    const summary = plan.stageSummaries[stageDef.dir];
    const effectiveStatus = getEffectiveStatus(stage, summary, stageDef.optional);
    const prerequisiteAssessment = assessPrerequisites(stageDef.prerequisites, variableValues, cardStatus, plan.deployedEnv);
    // This stage's own run, if it has one — a run on another card must not grey this one out.
    const run = plan.runs[stageDef.dir];
    // Failed dispatches are retryable; only an active run is stale, and changed inputs can still be refreshed.
    const isStale = run != null && run.error == null;
    const inputsMissing = prerequisiteAssessment.missing.length > 0 || prerequisiteAssessment.incomplete.length > 0;
    const deployDisabled = !repoDone || isStale || prerequisiteAssessment.blocked || !!run?.error;
    const cardId = getStageCardId(stageDef.dir);
    const requirements = repoDone
      ? []
      : [
          {
            label: repoDependencyLabel ?? "Repository & environment",
            target: "repo" as CardId,
          },
        ];
    const locked = requirements.length > 0;
    let cardSummary: string | undefined;
    if (!locked) {
      try {
        cardSummary = prerequisiteAssessment.blocked
          ? prerequisiteAssessment.summary
          : run?.error ?? (isStale
            ? run.kind === "deploy" ? "Deployment running..." : "Plan running..."
            : getStageSummaryText(stage, summary, plan.stagesLoading, false, stageDef.optional));
      } catch (error) {
        console.error("Failed to build stage card summary:", error);
        cardSummary = "";
      }
    }
    const card: CardChrome = {
      cardId,
      status: locked ? "idle" : run?.error ? "warning" : stageToCardStatus(effectiveStatus, isStale, plan.stagesLoading, prerequisiteAssessment.blocked), // Retryable dispatch errors stay orange; reported plan failures are red.
      summary: cardSummary,
      locked,
      requirements,
      unavailable: false,
      expanded: expandedIds.has(cardId),
      onToggle: () => onToggle(cardId),
      onRequirementClick,
    };
    const trackDeploy =
      !deployDisabled && effectiveStatus === "success" && stage.runId && selectedEnv
        ? async () => {
            await plan.deployStage(stageDef.dir);
          }
        : undefined;

    return {
      key: stageDef.dir,
      card,
      stageDef,
      stage,
      prerequisiteAssessment,
      latestSha: plan.latestSha,
      deployDisabled,
      deployedEnv: plan.deployedEnv,
      variableValues,
      cardStatus,
      account,
      repoName,
      selectedEnv,
      onVariableConfirmed,
      trackDeploy,
      onPlanSummary: (s) => plan.setStageSummary(stageDef.dir, s),
      onRunStatusUpdate: async () => {
        if (repoDone && !inputsMissing && !isStale) await plan.onRun(stageDef.dir);
      },
      statusUpdateRunning: isStale,
      statusUpdateCountdown: run?.countdown ?? 0,
      statusUpdateDisabled: !repoDone || inputsMissing || isStale,
      runError: run?.error ?? null,
      cardErrorMsg,
    };
  });
}
