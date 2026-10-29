/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import BrightnessAutoOutlinedIcon from "@mui/icons-material/BrightnessAutoOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { useColorScheme } from "@mui/material/styles";

// The tab title is the same sentence, so it is read from there rather than repeated here.
export default function Header() {
  const { mode, setMode } = useColorScheme();
  const nextMode = mode === "system" ? "light" : mode === "light" ? "dark" : mode === "dark" ? "system" : null;
  const modeLabel = mode === "system" ? "System" : mode === "light" ? "Light" : mode === "dark" ? "Dark" : null;
  const actionLabel = modeLabel && nextMode
    ? `Color scheme: ${modeLabel}. Switch to ${nextMode} mode.`
    : "Loading color scheme";
  const cycleMode = () => {
    if (!nextMode) return;
    setMode(nextMode);
    if (nextMode === "system" && typeof window.matchMedia !== "function") {
      document.documentElement.setAttribute("data-mui-color-scheme", "dark");
    }
  };

  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: { xs: 2, sm: 4 },
        py: 1.75,
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "7px",
          background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          color: "primary.contrastText",
        }}
      >
        ZB
      </Box>
      <Typography component="h1" variant="h1">
        {document.title}
      </Typography>
      <Box sx={{ ml: "auto", flexShrink: 0 }}>
        <Tooltip title={actionLabel}>
          <span>
            <IconButton
              aria-label={actionLabel}
              disabled={!mode}
              onClick={cycleMode}
              size="small"
            >
              {mode === "system" ? (
                <BrightnessAutoOutlinedIcon />
              ) : mode === "light" ? (
                <LightModeOutlinedIcon />
              ) : (
                <DarkModeOutlinedIcon />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
