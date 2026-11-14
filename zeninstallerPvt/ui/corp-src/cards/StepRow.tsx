/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, CircularProgress, LinearProgress, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import type { SetupStep } from "../types";

const STATUS_LABEL: Record<SetupStep["status"], string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  skipped: "Skipped",
  error: "Error",
};

// One row of the progress checklist the AzureConfigHook cards render while run() executes.
export default function StepRow({ step }: { step: SetupStep }) {
  // CSS variables keep status icons and progress colors in sync with the active color scheme.
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon aria-hidden="true" sx={{ typography: "body2", color: (theme) => theme.vars.palette.card.icon.complete }} />
    ) : step.status === "skipped" ? (
      <RemoveCircleOutlineIcon aria-hidden="true" sx={{ typography: "body2", color: (theme) => theme.vars.palette.card.icon.skipped }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "body2", color: (theme) => theme.vars.palette.error.light }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} aria-label={`Running: ${step.label}`} sx={{ color: (theme) => theme.vars.palette.primary.main }} />
    ) : (
      <RadioButtonUncheckedIcon aria-hidden="true" sx={{ typography: "body2", color: (theme) => theme.vars.palette.card.icon.unavailable }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box>
        {/* The lighter dark-scheme error color preserves readable contrast on dark surfaces. */}
        <Typography sx={(theme) => ({
          color: theme.vars.palette.text.secondary,
          ...(step.status === "error" && {
            color: theme.vars.palette.error.dark,
            ...theme.applyStyles("dark", { color: theme.vars.palette.error.light }),
          }),
        })}>{step.label}</Typography>
        <Box component="span" className="visually-hidden">Status: {STATUS_LABEL[step.status]}</Box>
        {step.detail && (
          <Typography data-sensitive="true" sx={{ color: (theme) => theme.vars.palette.card.mutedText, mt: 0.25, wordBreak: "break-all" }}>
            {step.detail}
          </Typography>
        )}
        {step.progress != null && step.status === "running" && (
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, step.progress * 100))}
            aria-label={`Progress: ${step.label}`}
            sx={{
              mt: 0.5,
              height: 4,
              borderRadius: 2,
              background: (theme) => theme.vars.palette.divider,
              "& .MuiLinearProgress-bar": { background: (theme) => theme.vars.palette.primary.main, borderRadius: 2 },
            }}
          />
        )}
      </Box>
    </Box>
  );
}
