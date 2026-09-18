import { Box } from "@mui/material";
import { ACTION_CONFIG } from "../../access-pass-src/config/planConfig";
import type { ActionType } from "../../access-pass-src/types";

export default function SummaryChip({ type, count }: { type: ActionType; count: number }) {
  const cfg     = ACTION_CONFIG[type];
  const isEmpty = count === 0;

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: "4px",
        background: isEmpty ? "#f8fafc" : cfg.bg,
        border: `1px solid ${isEmpty ? "#e2e8f0" : `${cfg.color}33`}`,
        fontSize: "0.72rem",
        fontFamily: "'IBM Plex Mono', monospace",
        color: isEmpty ? "#cbd5e1" : cfg.color,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span>{cfg.symbol}</span>
      <span>{count} {cfg.label}</span>
    </Box>
  );
}
