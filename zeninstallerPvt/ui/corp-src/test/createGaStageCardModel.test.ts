/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it, vi } from "vitest";
import type { GhEnv } from "../types";
import { GA_CLOUDFRONT_CARD_ID, GA_CLOUDFRONT_STAGE } from "../cards/GaCloudFront/config";
import { createGaStageCardModel } from "../cards/GaStage/createGaStageCardModel";
import type { UseDeploymentPlan } from "../cards/GaStage/useDeploymentPlan";
import { GA_SUBSCRIPTION_BUDGET_CARD_ID, GA_SUBSCRIPTION_BUDGET_STAGE } from "../cards/GaSubscriptionBudget/config";
import type { GaStageDefinition } from "../cards/GaStage/stageDefinitions";

function makePlan(): UseDeploymentPlan {
  return {
    latestSha: "latest",
    stages: [
      { stage: "SubscriptionBudget", status: "success", runId: "budget-run" },
      { stage: "CloudFront", status: "success", runId: "cloudfront-run" },
    ],
    stageSummaries: {},
    hasPlan: true,
    stagesLoading: false,
    runs: {},
    deployedEnv: null,
    onRun: vi.fn().mockResolvedValue(undefined),
    deployStage: vi.fn().mockResolvedValue(undefined),
    setStageSummary: vi.fn(),
  };
}

function configuredVariables(stageDef: GaStageDefinition): Record<string, string> {
  const values: Record<string, string> = {};
  for (const prerequisite of stageDef.prerequisites) {
    if (prerequisite.type === "var") values[prerequisite.key] = "configured";
    else if (prerequisite.type === "varGroup" || prerequisite.type === "stageVar") {
      for (const key of prerequisite.keys) values[key] = "configured";
    }
  }
  return values;
}

describe("createGaStageCardModel", () => {
  it("uses the explicit repository prerequisite target when locked", () => {
    const onRequirementClick = vi.fn();
    const model = createGaStageCardModel({
      cardId: GA_SUBSCRIPTION_BUDGET_CARD_ID,
      stageDef: GA_SUBSCRIPTION_BUDGET_STAGE,
      plan: makePlan(),
      allCards: {},
      repoDone: false,
      repoDependencyLabel: "Repository setup",
      expandedIds: new Set(),
      account: null,
      repoName: "repo",
      selectedEnv: null,
      variableValues: configuredVariables(GA_SUBSCRIPTION_BUDGET_STAGE),
      onVariableConfirmed: vi.fn(),
      onToggle: vi.fn(),
      onRequirementClick,
    });

    expect(model.card.requirements).toEqual([{ label: "Repository setup", target: "repo" }]);
    model.card.onRequirementClick("repo");
    expect(onRequirementClick).toHaveBeenCalledWith("repo");
  });

  it("uses explicit card identities and stage directories for expansion, planning, and deployment", async () => {
    const plan = makePlan();
    const onToggle = vi.fn();
    const onRequirementClick = vi.fn();
    const selectedEnv = { id: 1, name: "PROD", url: "https://github.example/env" } as GhEnv;
    const models = [
      createGaStageCardModel({
        cardId: GA_SUBSCRIPTION_BUDGET_CARD_ID,
        stageDef: GA_SUBSCRIPTION_BUDGET_STAGE,
        plan,
        allCards: {},
        repoDone: true,
        expandedIds: new Set([GA_SUBSCRIPTION_BUDGET_CARD_ID]),
        account: null,
        repoName: "repo",
        selectedEnv,
        variableValues: configuredVariables(GA_SUBSCRIPTION_BUDGET_STAGE),
        onVariableConfirmed: vi.fn(),
        onToggle,
        onRequirementClick,
      }),
      createGaStageCardModel({
        cardId: GA_CLOUDFRONT_CARD_ID,
        stageDef: GA_CLOUDFRONT_STAGE,
        plan,
        allCards: {},
        repoDone: true,
        expandedIds: new Set([GA_CLOUDFRONT_CARD_ID]),
        account: null,
        repoName: "repo",
        selectedEnv,
        variableValues: configuredVariables(GA_CLOUDFRONT_STAGE),
        onVariableConfirmed: vi.fn(),
        onToggle,
        onRequirementClick,
      }),
    ];

    for (const model of models) {
      expect(model.card.expanded).toBe(true);
      model.card.onToggle();
      await model.onRunStatusUpdate();
      model.onPlanSummary({ create: 1, update: 0, delete: 0, replace: 0 });
      await model.trackDeploy?.();
    }

    expect(models.map(({ card }) => card.cardId)).toEqual([GA_SUBSCRIPTION_BUDGET_CARD_ID, GA_CLOUDFRONT_CARD_ID]);
    expect(onToggle.mock.calls).toEqual([[GA_SUBSCRIPTION_BUDGET_CARD_ID], [GA_CLOUDFRONT_CARD_ID]]);
    expect(plan.onRun).toHaveBeenNthCalledWith(1, "SubscriptionBudget");
    expect(plan.onRun).toHaveBeenNthCalledWith(2, "CloudFront");
    expect(plan.deployStage).toHaveBeenNthCalledWith(1, "SubscriptionBudget");
    expect(plan.deployStage).toHaveBeenNthCalledWith(2, "CloudFront");
    expect(plan.setStageSummary).toHaveBeenNthCalledWith(1, "SubscriptionBudget", { create: 1, update: 0, delete: 0, replace: 0 });
    expect(plan.setStageSummary).toHaveBeenNthCalledWith(2, "CloudFront", { create: 1, update: 0, delete: 0, replace: 0 });
  });
});
