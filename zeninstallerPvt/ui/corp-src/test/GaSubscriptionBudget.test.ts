/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import GaSubscriptionBudget from "../cards/GaSubscriptionBudget/GaSubscriptionBudget";
import { GA_SUBSCRIPTION_BUDGET_CARD_ID, GA_SUBSCRIPTION_BUDGET_STAGE } from "../cards/GaSubscriptionBudget/config";

describe("GaSubscriptionBudget", () => {
  const props: ComponentProps<typeof GaSubscriptionBudget> = {
    card: {
      cardId: GA_SUBSCRIPTION_BUDGET_CARD_ID,
      status: "idle",
      locked: false,
      requirements: [],
      unavailable: false,
      expanded: false,
      onToggle: () => {},
      onRequirementClick: () => {},
    },
    stage: { stage: "SubscriptionBudget", status: "pending" },
    deployDisabled: true,
    deployedEnv: null,
    variableValues: {},
    cardStatus: {},
    account: null,
    repoName: "",
    selectedEnv: null,
    onVariableConfirmed: () => {},
    onPlanSummary: () => {},
    onRunStatusUpdate: async () => {},
    statusUpdateRunning: false,
    statusUpdateCountdown: 0,
    statusUpdateDisabled: true,
    runError: null,
    azureAccount: null,
  };

  it("defines its own stage and required budget inputs", () => {
    expect(GA_SUBSCRIPTION_BUDGET_CARD_ID).toBe("stage_GA_SubscriptionBudget");
    expect(GA_SUBSCRIPTION_BUDGET_STAGE).toMatchObject({
      dir: "SubscriptionBudget",
      workflowId: "plan.yml",
      deployWorkflowId: "deploy.yml",
    });
    expect(GA_SUBSCRIPTION_BUDGET_STAGE.prerequisites).toEqual(expect.arrayContaining([
      { type: "var", key: "NAME" },
      expect.objectContaining({ type: "varGroup", label: "Azure variables configured" }),
      expect.objectContaining({ type: "stageVar", keys: expect.arrayContaining(["CONTACT_EMAILS"]) }),
    ]));
  });

  it("composes the shared stage card with its explicit definition", () => {
    expect(GaSubscriptionBudget(props).props.stageDef).toBe(GA_SUBSCRIPTION_BUDGET_STAGE);
  });
});
