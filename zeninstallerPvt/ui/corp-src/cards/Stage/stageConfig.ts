/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { readWrite } from "../../config/azureConfig";
import type { ActionType } from "../../types";

// Azure permissions the SubscriptionBudget stage needs to create and remove its budget.
export const subscriptionBudgetAccess = (): CardResourceAccessRequest => ({
  subscription: [...readWrite("Microsoft.Consumption/budgets"), "Microsoft.Consumption/budgets/delete"],
});

export const ACTION_CONFIG: Record<ActionType, { symbol: string; color: string }> = {
  create: { symbol: "+", color: "success.main" },
  delete: { symbol: "-", color: "error.main" },
  update: { symbol: "~", color: "warning.main" },
  replace: { symbol: "+/-", color: "info.main" },
  noOp: { symbol: "=", color: "text.muted" },
  unknown: { symbol: "?", color: "text.muted" },
};
