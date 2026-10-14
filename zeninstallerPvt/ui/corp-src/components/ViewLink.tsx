/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { borderHoverTint, UI_FONT as uiFont } from "../config/styles";

type Props = {
  href: string;
  label?: string;
};

export default function ViewLink({ href, label = "View" }: Props) {
  return (
    <Button
      size="small"
      variant="outlined"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      aria-label={label}
      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
      sx={{
        flexShrink: 0,
        borderColor: "#e2e8f0",
        color: "#475569",
        fontSize: "1rem",
        textTransform: "none",
        ...uiFont,
        "&:hover": {
          borderColor: "#cbd5e1",
          color: "#0f172a",
          background: borderHoverTint("#cbd5e1"),
        },
        "&.Mui-focusVisible, &.Mui-focusVisible:hover": {
          background: "transparent",
          boxShadow: "none",
        },
      }}
    >
      <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
        {label}
      </Box>
    </Button>
  );
}
