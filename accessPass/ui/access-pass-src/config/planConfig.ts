import type { ActionType } from "../types";

export const ACTION_CONFIG: Record<ActionType, { symbol: string; color: string; bg: string; label: string }> = {
  create:  { symbol: "+", color: "#16a34a", bg: "#f0fdf4", label: "add"     },
  delete:  { symbol: "-", color: "#dc2626", bg: "#fef2f2", label: "destroy" },
  update:  { symbol: "~", color: "#d97706", bg: "#fffbeb", label: "change"  },
  replace: { symbol: "±", color: "#7c3aed", bg: "#faf5ff", label: "replace" },
  noOp:    { symbol: "=", color: "#94a3b8", bg: "#f8fafc", label: "noOp"    },
  unknown: { symbol: "|", color: "#94a3b8", bg: "#f8fafc", label: "unknown" },
};
