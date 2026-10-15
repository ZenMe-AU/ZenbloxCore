/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Typography } from "@mui/material";

// The tab title is the same sentence, so it is read from there rather than repeated here.
export default function Header() {
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
    </Box>
  );
}
