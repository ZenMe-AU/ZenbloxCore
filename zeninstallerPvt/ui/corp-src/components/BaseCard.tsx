/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useRef, useState, type ReactNode } from "react";
import { Box, ButtonBase, CircularProgress, Collapse, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import BlockIcon from "@mui/icons-material/Block";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { alpha, useTheme } from "@mui/material/styles";
import { borderHoverTint, borderTint } from "../config/styles";
import type { BaseCardContext, Lifecycle } from "./basecardlifecycle";
import StateDiagram, { type StateDiagramLayout } from "./StateDiagram";

type Props<StateId extends string> = {
  baseCardContext: BaseCardContext<StateId>;
  expanded?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  descriptionId?: string;
  children: ReactNode;
  stateDiagramLayout?: StateDiagramLayout<StateId>;
};

const lifecycleLabels: Record<Lifecycle, string> = {
  blocked: "Blocked",
  loading: "Checking prerequisites",
  ready: "Ready",
  action: "Action",
  commit: "Commit",
  complete: "Complete",
  error: "Error",
};

export default function BaseCard<StateId extends string = Lifecycle>({
  baseCardContext, expanded, onToggle, action, descriptionId, children, stateDiagramLayout,
}: Props<StateId>) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = expanded ?? localExpanded;
  const toggle = onToggle ?? (() => setLocalExpanded((value) => !value));
  const { cardId, title, summary, lifecycle } = baseCardContext;
  const stateMachine = baseCardContext.stateMachine;
  const theme = useTheme();
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [showStateDiagram, setShowStateDiagram] = useState(false);
  const colors = theme.vars.palette.card;
  const colorKey = lifecycle === "blocked" ? "idle" : lifecycle === "ready" || lifecycle === "action" || lifecycle === "commit" ? "warning" : lifecycle;
  const muted = lifecycle === "blocked";
  const titleId = `card-title-${cardId}`;
  const contentId = `card-content-${cardId}`;
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const iconColor = colors.icon[colorKey];
  const icon = muted
    ? <BlockIcon aria-hidden="true" sx={{ typography: "caption", color: colors.lockedIcon }} />
    : lifecycle === "loading"
      ? <CircularProgress size={16} aria-hidden="true" sx={{ color: iconColor }} />
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
        gridColumn: isExpanded ? "1 / -1" : "auto",
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
      {stateMachine && (
        <Menu
          open={contextMenu !== null}
          onClose={() => setContextMenu(null)}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        >
          <MenuItem
            role="menuitemcheckbox"
            aria-checked={showStateDiagram}
            onClick={() => {
              setShowStateDiagram((visible) => !visible);
              setContextMenu(null);
            }}
          >
            <ListItemIcon>
              {showStateDiagram ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{showStateDiagram ? "Hide state diagram" : "Show state diagram"}</ListItemText>
          </MenuItem>
        </Menu>
      )}
      <Box
        onContextMenu={isExpanded && stateMachine ? (event) => {
          event.preventDefault();
          setContextMenu({ mouseX: event.clientX + 2, mouseY: event.clientY - 6 });
        } : undefined}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          const dragged = event.detail > 0 && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 2;
          const selection = dragged ? event.currentTarget.ownerDocument.getSelection() : null;
          if (selection && !selection.isCollapsed && selection.containsNode(event.currentTarget, true)) return;
          toggle();
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: isExpanded ? "wrap" : "nowrap",
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
        <Typography component="h3" id={titleId} variant="inherit" sx={{ flex: isExpanded ? "1 1 240px" : 1, minWidth: 0, m: 0, fontWeight: "inherit" }}>
          <ButtonBase
            disableRipple
            aria-expanded={isExpanded}
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
            <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: isExpanded ? "row" : "column", flexWrap: "wrap", alignItems: isExpanded ? "baseline" : "stretch", columnGap: 2, rowGap: 0.25 }}>
              <Typography
                component="span"
                sx={{
                  display: "block",
                  userSelect: "text",
                  typography: "body1",
                  fontWeight: 600,
                  color: muted ? colors.mutedText : theme.vars.palette.text.primary,
                  letterSpacing: 0,
                  whiteSpace: isExpanded ? "normal" : "nowrap",
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
                    color: muted ? colors.mutedText : colors.summary[colorKey],
                    minWidth: 0,
                    maxWidth: "100%",
                    whiteSpace: isExpanded ? "normal" : "nowrap",
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
                {lifecycleLabels[lifecycle]}
              </Box>
            </Box>
          </ButtonBase>
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0, ml: "auto" }}>
          {isExpanded && action && (
            <Box onClick={(event) => event.stopPropagation()} sx={{ display: "flex", alignItems: "center" }}>
              {action}
            </Box>
          )}
          <IconButton
            disableRipple
            size="small"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={isExpanded}
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
            {isExpanded ? <ExpandLessIcon fontSize="small" aria-hidden="true" /> : <ExpandMoreIcon fontSize="small" aria-hidden="true" />}
          </IconButton>
        </Box>
      </Box>
      <Collapse in={isExpanded}>
        <Box id={contentId} role="region" aria-labelledby={titleId} sx={{ borderTop: `1px solid ${colors.contentDivider}`, px: 2.5, py: 2.5 }}>
          {stateMachine && showStateDiagram && (
            <StateDiagram graph={stateMachine.graph} currentState={stateMachine.currentState} layout={stateDiagramLayout} />
          )}
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
