/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ActionType } from "../../types";

export const ACTION_CONFIG: Record<ActionType, { symbol: string; color: string }> = {
  create: { symbol: "+", color: "#16a34a" },
  delete: { symbol: "-", color: "#dc2626" },
  update: { symbol: "~", color: "#d97706" },
  replace: { symbol: "+/-", color: "#7c3aed" },
  noOp: { symbol: "=", color: "#94a3b8" },
  unknown: { symbol: "?", color: "#94a3b8" },
};
