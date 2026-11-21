/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useRef, type ReactNode } from "react";
import { Box, ButtonBase, CircularProgress, Collapse, IconButton, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import BlockIcon from "@mui/icons-material/Block";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { alpha, useTheme } from "@mui/material/styles";
import { borderHoverTint, borderTint } from "../config/styles";
import type { CardLifecycle } from "./cardLifecycle";

type Props = {
  cardId: string;
  title: string;
  summary?: string;
  lifecycle: CardLifecycle;
  locked: boolean;
  unavailable: boolean;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
  descriptionId?: string;
  children: ReactNode;
};

const lifecycleLabels: Record<CardLifecycle, string> = {
  blocked: "Locked",
  loading: "Checking prerequisites",
  ready: "Ready",
  complete: "Complete",
  error: "Error",
};

export default function BaseCard({
  cardId, title, summary, lifecycle, locked, unavailable, expanded, onToggle, action, descriptionId, children,
}: Props) {
  const theme = useTheme();
  const colors = theme.vars.palette.card;
  const colorKey = unavailable ? "unavailable" : lifecycle === "blocked" ? "idle" : lifecycle === "ready" ? "warning" : lifecycle;
  const muted = locked || unavailable;
  const titleId = `card-title-${cardId}`;
  const contentId = `card-content-${cardId}`;
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const iconColor = colors.icon[colorKey];
  const icon = locked
    ? <BlockIcon aria-hidden="true" sx={{ typography: "caption", color: colors.lockedIcon }} />
    : lifecycle === "loading"
      ? <CircularProgress size={16} aria-hidden="true" sx={{ color: iconColor }} />
      : unavailable
      ? <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: iconColor }} />
      : lifecycle === "complete"
        ? <CheckCircleIcon aria-hidden="true" sx={{ typography: "caption", color: iconColor }} />
        : lifecycle === "error"
          ? <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "caption", color: iconColor }} />
          : <RadioButtonUncheckedIcon aria-hidden="true" sx={{ typography: "caption", color: iconColor }} />;

  return (
    <Box
      id={`card-${cardId}`}
      sx={{
        boxSizing: "border-box",
        width: "100%",
        gridColumn: expanded ? "1 / -1" : "auto",
        maxWidth: "100%",
        border: "1px solid",
        borderColor: muted ? theme.vars.palette.divider : colors.border[colorKey],
        borderRadius: theme.palette.card.radius,
        background: muted ? colors.mutedBackground : theme.vars.palette.background.paper,
        overflow: "hidden",
        boxShadow: colors.shadow,
        transition: "width 0.25s ease, border-color 0.2s, background 0.2s, box-shadow 0.2s",
        "&:hover": { boxShadow: colors.hoverShadow },
      }}
    >
      <Box
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          const dragged = event.detail > 0 && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 2;
          const selection = dragged ? event.currentTarget.ownerDocument.getSelection() : null;
          if (selection && !selection.isCollapsed && selection.containsNode(event.currentTarget, true)) return;
          onToggle();
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: expanded ? "wrap" : "nowrap",
          gap: 1.25,
          px: 2,
          py: 1.5,
          minHeight: 80,
          boxSizing: "border-box",
          cursor: "pointer",
          background: muted ? undefined : borderTint(colors.border[colorKey], theme.vars.palette.background.paper, 30),
          transition: "background 0.2s",
          "&:hover": {
            background: muted
              ? borderHoverTint(theme.palette.divider, theme.vars.palette.background.paper)
              : borderTint(colors.border[colorKey], theme.vars.palette.background.paper, 45),
          },
        }}
      >
        <Typography component="h3" id={titleId} variant="inherit" sx={{ flex: expanded ? "1 1 240px" : 1, minWidth: 0, m: 0, fontWeight: "inherit" }}>
          <ButtonBase
            disableRipple
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-describedby={descriptionId}
            sx={{
              display: "flex",
              width: "100%",
              minWidth: 0,
              justifyContent: "flex-start",
              gap: 1.25,
              textAlign: "left",
              "&.Mui-focusVisible": {
                outline: `2px solid ${theme.palette.primary.light}`,
                outlineOffset: 2,
                borderRadius: "8px",
                boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}`,
              },
            }}
          >
            {icon}
            <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: expanded ? "row" : "column", flexWrap: "wrap", alignItems: expanded ? "baseline" : "stretch", columnGap: 2, rowGap: 0.25 }}>
              <Typography
                component="span"
                sx={{
                  display: "block",
                  userSelect: "text",
                  typography: "body1",
                  fontWeight: 600,
                  color: muted ? colors.mutedText : theme.vars.palette.text.primary,
                  letterSpacing: 0,
                  whiteSpace: expanded ? "normal" : "nowrap",
                  overflowWrap: "anywhere",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={title}
                data-a11y-contrast-exception={muted ? "muted-card-title" : undefined}
              >
                {title}
              </Typography>
              {summary && (
                <Typography
                  component="span"
                  sx={{
                    display: "block",
                    typography: "body1",
                    color: locked ? colors.mutedText : colors.summary[colorKey],
                    minWidth: 0,
                    maxWidth: "100%",
                    whiteSpace: expanded ? "normal" : "nowrap",
                    overflowWrap: "anywhere",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={summary}
                >
                  {summary}
                </Typography>
              )}
              <Box component="span" className="visually-hidden">
                {locked ? "Locked" : unavailable ? "Unavailable" : lifecycleLabels[lifecycle]}
              </Box>
            </Box>
          </ButtonBase>
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0, ml: "auto" }}>
          {expanded && !muted && (
            <Box onClick={(event) => event.stopPropagation()} sx={{ display: "flex", alignItems: "center" }}>
              {action}
            </Box>
          )}
          <IconButton
            disableRipple
            size="small"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-describedby={descriptionId}
            sx={{
              color: colors.mutedIcon,
              "&:hover": { color: colors.mutedIconHover },
              "&.Mui-focusVisible": {
                outline: `2px solid ${theme.palette.primary.light}`,
                outlineOffset: 1,
                borderRadius: "50%",
                boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}`,
              },
            }}
          >
            {expanded ? <ExpandLessIcon fontSize="small" aria-hidden="true" /> : <ExpandMoreIcon fontSize="small" aria-hidden="true" />}
          </IconButton>
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box id={contentId} role="region" aria-labelledby={titleId} sx={{ borderTop: `1px solid ${colors.contentDivider}`, px: 2.5, py: 2.5 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
