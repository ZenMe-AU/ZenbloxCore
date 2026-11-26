/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Box, ButtonBase, Collapse, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import "./CollapsiblePanel.css";

type Props = {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  stage?: boolean;
};

export default function CollapsiblePanel({ id, label, open, onToggle, children, stage = false }: Props) {
  const name = label.toLowerCase();
  return (
    <Box className={`collapsible-panel${stage ? " collapsible-panel--stage" : ""}`}>
      <ButtonBase
        disableRipple
        className="collapsible-panel__toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={stage ? (open ? "collapse" : `open ${name}`) : (open ? `Collapse ${name}` : `View ${name}`)}
        aria-controls={id}
      >
        <Box className="collapsible-panel__line" />
        <Typography className="collapsible-panel__label">
          {open ? `hide ${name}` : `view ${name}`}
        </Typography>
        <KeyboardArrowDownIcon
          className="collapsible-panel__icon"
          aria-hidden="true"
        />
        <Box className="collapsible-panel__line" />
      </ButtonBase>
      <Collapse in={open} timeout={300}>
        <Box id={id} role="region" aria-label={label} className="collapsible-panel__content">
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
