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

// One row of the progress checklist the AzureConfigHook cards render while run() executes.
export default function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ fontSize: 14, color: (theme) => theme.palette.card.icon.complete }} />
    ) : step.status === "skipped" ? (
      <RemoveCircleOutlineIcon sx={{ fontSize: 14, color: (theme) => theme.palette.card.icon.skipped }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon sx={{ fontSize: 14, color: (theme) => theme.palette.error.light }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} sx={{ color: (theme) => theme.palette.primary.main }} />
    ) : (
      <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: (theme) => theme.palette.card.icon.unavailable }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box>
        <Typography sx={{ color: (theme) => step.status === "error" ? theme.palette.error.light : theme.palette.text.secondary }}>{step.label}</Typography>
        {step.detail && (
          <Typography data-sensitive="true" sx={{ color: (theme) => theme.palette.card.mutedText, mt: 0.25, wordBreak: "break-all" }}>
            {step.detail}
          </Typography>
        )}
        {step.progress != null && step.status === "running" && (
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, step.progress * 100))}
            sx={{
              mt: 0.5,
              height: 4,
              borderRadius: 2,
              background: (theme) => theme.palette.divider,
              "& .MuiLinearProgress-bar": { background: (theme) => theme.palette.primary.main, borderRadius: 2 },
            }}
          />
        )}
      </Box>
    </Box>
  );
}
