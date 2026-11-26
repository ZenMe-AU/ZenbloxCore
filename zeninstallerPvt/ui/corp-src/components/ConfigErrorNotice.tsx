/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

/*
 * Shown in place of a card's normal content when a required env var / config
 * value is missing, so the card stays visible instead of silently disappearing.
 */
export default function ConfigErrorNotice({ id }: { id: string }) {
  // Resolve error colors from the active scheme so the notice remains legible in dark mode.
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        px: 1.5,
        py: 1.25,
        backgroundColor: (theme) => theme.vars.palette.background.paper,
        border: (theme) => `1px solid ${theme.vars.palette.error.dark}`,
        ...theme.applyStyles("dark", { borderColor: theme.vars.palette.error.light }),
        "@supports (color: color-mix(in srgb, red, white))": {
          backgroundColor: (theme) => `color-mix(in srgb, ${theme.vars.palette.error.main} 8%, ${theme.vars.palette.background.paper})`,
          borderColor: (theme) => `color-mix(in srgb, ${theme.vars.palette.error.main} 70%, ${theme.vars.palette.background.paper})`,
        },
        borderRadius: "8px",
      })}
    >
      <ErrorOutlineIcon sx={{ typography: "caption", color: (theme) => theme.vars.palette.error.main, flexShrink: 0, mt: "1px" }} />
      <Typography
        id={id}
        sx={(theme) => ({
          typography: "body1",
          color: theme.vars.palette.error.dark,
          lineHeight: 1.6,
          // Dark scheme's error.dark is too dark for text on a dark surface.
          ...theme.applyStyles("dark", { color: theme.vars.palette.error.light }),
        })}
      >
        This card is unavailable because a required setting is missing or invalid. Ask your ZenInstaller administrator to check the installer configuration.
      </Typography>
    </Box>
  );
}
