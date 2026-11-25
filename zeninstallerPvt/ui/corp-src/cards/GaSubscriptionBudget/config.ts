/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardId, StageDefinition } from "../../types";
import { AZURE_VARIABLE_KEYS, C01_KEYS } from "../../logic/variables";

export const GA_SUBSCRIPTION_BUDGET_CARD_ID = "stage_GA_SubscriptionBudget" satisfies CardId;

export const GA_SUBSCRIPTION_BUDGET_STAGE: StageDefinition = {
  dir: "SubscriptionBudget",
  label: "GA Azure subscription budget",
  description: "Sets a spending budget on the Azure subscription and emails the contacts you list when costs approach it.",
  workflowId: "plan.yml",
  deployWorkflowId: "deploy.yml",
  azurePermissions: [],
  prerequisites: [
    { type: "var", key: "NAME" },
    { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
    {
      type: "stageVar",
      keys: C01_KEYS,
      label: "c01 variables",
      descriptions: {
        CONTACT_EMAILS: "Multiple emails — separate with a comma, e.g. alice@example.com,bob@example.com",
      },
    },
  ],
};
