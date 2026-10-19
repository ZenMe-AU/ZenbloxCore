/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { borderHoverTint } from "../config/styles";

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
      aria-label={`${label} (opens in new tab)`}
      endIcon={<OpenInNewIcon sx={{ typography: "caption" }} />}
      sx={{
        flexShrink: 0,
        borderColor: "divider",
        color: "text.secondary",
        textTransform: "none",
        "&:hover": {
          borderColor: "divider",
          color: "text.primary",
          background: (theme) => borderHoverTint(theme.palette.divider),
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
