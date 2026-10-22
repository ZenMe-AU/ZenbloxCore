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
export default function ConfigErrorNotice() {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        px: 1.5,
        py: 1.25,
        background: (theme) => `color-mix(in srgb, ${theme.palette.error.main} 6%, white)`,
        border: (theme) => `1px solid color-mix(in srgb, ${theme.palette.error.main} 24%, white)`,
        borderRadius: "8px",
      }}
    >
      <ErrorOutlineIcon sx={{ typography: "caption", color: "error.light", flexShrink: 0, mt: "1px" }} />
      <Typography sx={{ typography: "body1", color: "error.dark", lineHeight: 1.6 }}>
        This card is unavailable because a required setting is missing or invalid. Ask your ZenInstaller administrator to check the installer configuration.
      </Typography>
    </Box>
  );
}
