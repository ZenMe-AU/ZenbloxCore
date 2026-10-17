/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ACTION_CONFIG } from "./stageConfig";
import { getActionType } from "../../logic/stage";
import type { PlanItem, PlanSummary } from "../../types";
import { MONO_FONT } from "../../config/styles";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";

function SummaryPill({ label, count, color }: { label: string; count: number; color: "success" | "warning" | "error" | "info" }) {
  return (
    <Box
      sx={(theme) => ({
        px: 0.875,
        py: 0.25,
        borderRadius: "4px",
        border: "1px solid",
        borderColor: alpha(theme.palette[color].main, 0.2),
        color: theme.palette[color].main,
      })}
    >
      {label} {count}
    </Box>
  );
}

function BehindPill({ planSha, latestSha }: { planSha?: string; latestSha?: string }) {
  const detail = planSha && latestSha ? `Planned at ${planSha.slice(0, 7)} \u00b7 the branch is now at ${latestSha.slice(0, 7)}` : "";
  return (
    <Tooltip title={detail} placement="top">
      <Box
        sx={{
          px: 0.875,
          py: 0.25,
          borderRadius: "4px",
          border: "1px solid",
          borderColor: "warning.light",
          backgroundColor: "action.hover",
          color: "warning.main",
          cursor: "default",
        }}
      >
        not latest
      </Box>
    </Tooltip>
  );
}

function DeployButton({ onDeploy, disabled }: { onDeploy: () => void; disabled?: boolean }) {
  return (
    <Button
      disabled={disabled}
      variant="contained"
      size="small"
      onClick={() => void onDeploy()}
      sx={{
        py: 0.45,
        px: 1.5,
      }}
    >
      Deploy
    </Button>
  );
}

export default function StagePlanDetail({
  items,
  summary,
  loading,
  error,
  onDeploy,
  stagesStale,
  behind,
  planSha,
  latestSha,
}: {
  items: PlanItem[];
  summary: PlanSummary;
  loading: boolean;
  error: string | null;
  onDeploy?: () => void;
  stagesStale?: boolean;
  behind?: boolean;
  planSha?: string;
  latestSha?: string;
}) {
  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
        <CircularProgress aria-label="Loading deployment plan" size={13} sx={{ color: "text.disabled" }} />
        <StatusText>Loading plan...</StatusText>
      </Box>
    );
  }

  if (error) return <ErrorText>{error}</ErrorText>;

  const hasChanges = summary.create + summary.update + summary.delete + summary.replace > 0;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="sectionLabel">
          Planned Changes for Deployment
        </Typography>
        {behind && <BehindPill planSha={planSha} latestSha={latestSha} />}
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          mb: hasChanges ? 1.5 : 0,
        }}
      >
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {hasChanges ? (
            <>
              <SummaryPill label="create" count={summary.create} color="success" />
              <SummaryPill label="update" count={summary.update} color="warning" />
              <SummaryPill label="delete" count={summary.delete} color="error" />
              {summary.replace > 0 && <SummaryPill label="replace" count={summary.replace} color="info" />}
            </>
          ) : (
            <Typography color="text.muted">No changes detected.</Typography>
          )}
        </Box>
        {onDeploy && <DeployButton onDeploy={onDeploy} disabled={stagesStale} />}
      </Box>

      {hasChanges && (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
          {items.map((item, idx) => {
            const type = getActionType(item.change.actions) ?? "unknown";
            const cfg = ACTION_CONFIG[type];
            return (
              <Box
                key={`${item.address}-${idx}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 2,
                  py: 0.875,
                  borderBottom: idx < items.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                  backgroundColor: idx % 2 === 0 ? "background.paper" : "background.default",
                }}
              >
                <Box sx={{ width: 26, color: cfg.color, fontWeight: 700, flexShrink: 0 }}>{cfg.symbol}</Box>
                <Typography color="text.secondary" sx={{ wordBreak: "break-all", ...MONO_FONT }}>{item.address}</Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
