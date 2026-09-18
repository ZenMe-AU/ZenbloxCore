import type { ActionType, PlanItem, PlanSummary } from "../../access-pass-src/types";

export function getActionType(actions: string[]): ActionType | null {
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
      if (t === "create")  acc.create++;
      if (t === "update")  acc.update++;
      if (t === "delete")  acc.delete++;
      if (t === "replace") acc.replace++;
      return acc;
    },
    { create: 0, update: 0, delete: 0, replace: 0 },
  );
}
