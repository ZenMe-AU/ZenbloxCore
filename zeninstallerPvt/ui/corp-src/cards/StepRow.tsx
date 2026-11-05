/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, CircularProgress, LinearProgress, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { Fragment } from "react";
import ExternalLink from "../components/ExternalLink";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import type { SetupStep } from "../types";

// One row of the progress checklist the AzureConfigHook cards render while run() executes.
export default function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ typography: "body2", color: (theme) => theme.palette.card.icon.complete }} />
    ) : step.status === "skipped" ? (
      <RemoveCircleOutlineIcon sx={{ typography: "body2", color: (theme) => theme.palette.card.icon.skipped }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon sx={{ typography: "body2", color: (theme) => theme.palette.error.light }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} sx={{ color: (theme) => theme.palette.primary.main }} />
    ) : (
      <RadioButtonUncheckedIcon sx={{ typography: "body2", color: (theme) => theme.palette.card.icon.unavailable }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", minWidth: 0, alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "normal" }}>
        <Typography sx={{ color: (theme) => step.status === "error" ? theme.palette.error.dark : theme.palette.text.secondary }}>{step.label}</Typography>
        {step.detail && (
          <Typography data-sensitive="true" sx={{ color: (theme) => theme.palette.card.mutedText, mt: 0.25 }}>
            {step.detail.split(AZURE_PIM_ACTIVATION_URL).map((text, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <ExternalLink href={AZURE_PIM_ACTIVATION_URL} label="Activate an Azure resource role in PIM">
                    PIM - My roles - Azure resources
                  </ExternalLink>
                )}
                {text}
              </Fragment>
            ))}
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
