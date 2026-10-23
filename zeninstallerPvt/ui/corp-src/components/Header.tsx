/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { useColorScheme } from "@mui/material/styles";

// The tab title is the same sentence, so it is read from there rather than repeated here.
export default function Header() {
  const { mode, setMode } = useColorScheme();
  const actionLabel = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";

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
              onClick={() => setMode(mode === "dark" ? "light" : "dark")}
              size="small"
            >
              {mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
