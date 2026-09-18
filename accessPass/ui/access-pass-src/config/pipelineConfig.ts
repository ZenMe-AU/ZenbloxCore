import type { CardStatus, StageStatus } from "../types";

export const PIPELINE_LINE_COLOR: Record<CardStatus, string> = {
  complete: "#bbf7d0",
  warning: "#fed7aa",
  error: "#fecaca",
  loading: "#bfdbfe",
  idle: "#e2e8f0",
  skipped: "#e2e8f0",
};

export const STAGE_STATUS_CONFIG: Record<StageStatus, { color: string; label: string }> = {
  deployed: { color: "#22c55e", label: "Deployed" },
  success:  { color: "#f97316", label: "Ready to deploy" },
  failed:   { color: "#ef4444", label: "Failed" },
  pending:  { color: "#94a3b8", label: "Not yet executed" },
  skipped:  { color: "#94a3b8", label: "Skipped" },
};
