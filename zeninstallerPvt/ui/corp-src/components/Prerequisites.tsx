/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Box, ButtonBase, Collapse, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

type Props = {
  id: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  stage?: boolean;
};

export default function Prerequisites({ id, open, onToggle, children, stage = false }: Props) {
  return (
    <Box sx={stage ? undefined : { minWidth: 0 }}>
      <ButtonBase
        disableRipple
        onClick={onToggle}
        aria-expanded={open}
        aria-label={stage ? (open ? "collapse" : "open prerequisites") : (open ? "Collapse prerequisites" : "View prerequisites")}
        aria-controls={id}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          userSelect: "none",
          py: 0.25,
          "&:hover .prerequisites-toggle-label, &:focus-visible .prerequisites-toggle-label": { color: "primary.main" },
          "&:hover .prerequisites-toggle-line, &:focus-visible .prerequisites-toggle-line": { backgroundColor: "primary.main" },
          "&:hover .prerequisites-toggle-icon, &:focus-visible .prerequisites-toggle-icon": { color: "primary.main" },
        }}
      >
        <Box className="prerequisites-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
        <Typography className="prerequisites-toggle-label" color="text.muted" sx={{ whiteSpace: "nowrap", transition: "color 0.2s" }}>
          {open ? "hide prerequisites" : "view prerequisites"}
        </Typography>
        <KeyboardArrowDownIcon
          className="prerequisites-toggle-icon"
          sx={{
            typography: stage ? "body2" : "caption",
            color: "text.muted",
            transform: open ? "rotate(180deg)" : "none",
            transition: "color 0.2s, transform 0.2s",
          }}
          aria-hidden="true"
        />
        <Box className="prerequisites-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
      </ButtonBase>
      <Collapse in={open} timeout={300}>
        <Box id={id} role="region" aria-label="Prerequisites" sx={stage ? { display: "flex", flexDirection: "column", mt: 0.5 } : { mt: 0.5 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
