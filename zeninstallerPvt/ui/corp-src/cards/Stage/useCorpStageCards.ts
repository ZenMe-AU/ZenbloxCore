/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Account, CardHook, CardId, CardStatus, GhEnv, PipelineConfig, PlanSummary, Stage, StageDefinition } from "../../types";
import type { UseDeploymentPlan } from "./useDeploymentPlan";
import { getEffectiveStatus, getStageCardId, getStageSummaryText, hasVariableDiff, stageToCardStatus } from "../../logic/stage";

// Registers the pipeline-stage card ids (stage_<dir>) in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    [id: `stage_${string}`]: true;
  }
}

export type CorpStageCardModel = {
  key: string;
  face: CardHook;
  stageDef: StageDefinition;
  stage: Stage;
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
  faces,
  repoDone,
  account,
  repoName,
  selectedEnv,
  variableValues,
  onVariableConfirmed,
}: {
  pipeline: PipelineConfig;
  plan: UseDeploymentPlan;
  faces: CardHook[];
  repoDone: boolean;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variableValues: Record<string, string>;
  onVariableConfirmed: (key: string, value: string) => void;
}): CorpStageCardModel[] {
  const cardStatus = Object.fromEntries(faces.map((face) => [face.cardId, face.status])) as Record<CardId, CardStatus>;

  return pipeline.stages.map((stageDef: StageDefinition) => {
    const stage = plan.stages.find((s) => s.stage === stageDef.dir) ?? {
      stage: stageDef.dir,
      status: "pending" as const,
    };
    const summary = plan.stageSummaries[stageDef.dir];
    const effectiveStatus = getEffectiveStatus(stage, summary, stageDef.optional);
    const varsMismatch = plan.deployedEnv != null && hasVariableDiff(stageDef.prerequisites, variableValues, plan.deployedEnv);
    // This stage's own run, if it has one — a run on another card must not grey this one out.
    const run = plan.runs[stageDef.dir];
    const isStale = run != null;
    const deployDisabled = isStale || varsMismatch;
    const status = stageToCardStatus(effectiveStatus, isStale, plan.stagesLoading);
    // Locked behind the repo card, like any card with requirements: CardsProvider shows it idle until then.
    const face: CardHook = {
      cardId: getStageCardId(stageDef.dir),
      status,
      summary: getStageSummaryText(stage, summary, plan.stagesLoading, isStale, stageDef.optional),
      done: repoDone && (status === "complete" || status === "skipped"),
      cardRequirements: ["repo"],
    };
    const trackDeploy =
      effectiveStatus === "success" && stage.runId && selectedEnv
        ? async () => {
            await plan.deployStage(stageDef.dir);
          }
        : undefined;

    return {
      key: stageDef.dir,
      face,
      stageDef,
      stage,
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
      onRunStatusUpdate: () => plan.onRun(stageDef.dir),
      statusUpdateRunning: run != null && run.error == null,
      statusUpdateCountdown: run?.countdown ?? 0,
      statusUpdateDisabled: !repoDone || run != null,
      runError: run?.error ?? null,
    };
  });
}
