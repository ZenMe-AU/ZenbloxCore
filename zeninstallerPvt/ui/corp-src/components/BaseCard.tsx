/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useRef, useState, type ReactNode } from "react";
import { Box, ButtonBase, CircularProgress, Collapse, IconButton, Link, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import BlockIcon from "@mui/icons-material/Block";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { alpha, useTheme } from "@mui/material/styles";
import type { AppContext } from "../appContext";
import { borderHoverTint, borderTint } from "../config/styles";
import type { BaseCardContext, Lifecycle, StateGraph } from "./basecardlifecycle";
import StateDiagram, { type StateDiagramLayout } from "./StateDiagram";

type Props<StateId extends string> = {
  baseCardContext: BaseCardContext<StateId>;
  appContext?: ReturnType<AppContext["getSnapshot"]>;
  expanded?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  descriptionId?: string;
  children: ReactNode;
  blockedIntro?: ReactNode;
  blockedContent?: ReactNode;
  loadingContent?: ReactNode;
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
  forceUnlocked: "Force unlocked",
};


export default function BaseCard<StateId extends string = Lifecycle>({
  baseCardContext, appContext, expanded, onToggle, action, descriptionId, children,
  blockedIntro, blockedContent, loadingContent, stateDiagramLayout,
}: Props<StateId>) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = expanded ?? localExpanded;
  const toggle = onToggle ?? (() => setLocalExpanded((value) => !value));
  const { cardId, title, summary, lifecycle: cardLifecycle } = baseCardContext;
  const [displayLifecycle, setDisplayLifecycle] = useState<{ source: Lifecycle; current: Lifecycle }>(() => ({
    source: cardLifecycle,
    current: cardLifecycle,
  }));
  if (displayLifecycle.source !== cardLifecycle) {
    setDisplayLifecycle({ source: cardLifecycle, current: cardLifecycle });
  }
  const lifecycle = displayLifecycle.current;
  const forceUnlocked = lifecycle === "forceUnlocked";
  const stateMachine = baseCardContext.stateMachine;
  const theme = useTheme();
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [showStateDiagram, setShowStateDiagram] = useState(false);
  const colors = theme.vars.palette.card;
  const colorKey = lifecycle === "blocked" ? "idle" : lifecycle === "forceUnlocked" || lifecycle === "ready" || lifecycle === "action" || lifecycle === "commit" ? "warning" : lifecycle;
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
          : lifecycle === "forceUnlocked"
            ? <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: iconColor }} />
            : <RadioButtonUncheckedIcon aria-hidden="true" sx={{ typography: "caption", color: iconColor }} />;

  function setForceUnlock(value: boolean) {
    setDisplayLifecycle({ source: cardLifecycle, current: value ? "forceUnlocked" : cardLifecycle });
  }

  const forceUnlockNotice = (
    <Typography role="status" sx={{ mb: 2 }}>
      <Link component="button" type="button" color="warning.main" onClick={() => setForceUnlock(false)}>
        This card is force-unlocked; its prerequisites are still incomplete. (Click to undo)
      </Link>
    </Typography>
  );

  const defaultLoadingContent = (
    <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <CircularProgress size={20} aria-hidden="true" />
      <Typography>Loading...</Typography>
    </Box>
  );

  const blockedPrerequisites = baseCardContext.unmetCardPrerequisites ?? [];
  // opens the card (cards keep their own expanded state, so through its title button) and scrolls to it.
  const openPrerequisite = (id: string) => {
    const card = document.getElementById(`card-${id}`);
    const titleButton = card?.querySelector<HTMLButtonElement>("h3 button");
    if (titleButton?.getAttribute("aria-expanded") === "false") titleButton.click();
    titleButton?.focus({ preventScroll: true });
    card?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
  };
  const defaultBlockedContent = (
    <>
      {blockedIntro && <Box sx={{ mb: 2 }}>{blockedIntro}</Box>}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.75,
          px: 1.75,
          py: 1.5,
          background: colors.requirementPanel,
          border: `1px solid ${theme.vars.palette.divider}`,
          borderRadius: "8px",
        }}
      >
        <Typography sx={{ typography: "body1", color: theme.vars.palette.text.secondary }}>
          The following prerequisites are incomplete, or{" "}
          <Link component="button" type="button" onClick={() => setForceUnlock(true)}>
            click here to force unlock this card.
          </Link>
        </Typography>
        {blockedContent ?? blockedPrerequisites.map((id, index) => {
          const card = Object.entries(appContext?.cards ?? {}).find(([registeredId]) => registeredId === id)?.[1];
          return card?.initialised ? (
            <Link key={`${index}-${id}`} component="button" type="button" onClick={() => openPrerequisite(id)} sx={{ alignSelf: "flex-start", fontWeight: 500 }}>
              {card.title} ({id})
            </Link>
          ) : (
            <Typography key={`${index}-${id}`} sx={{ typography: "body1", color: colors.requirementText, fontWeight: 500 }}>
              {id}
            </Typography>
          );
        })}
      </Box>
    </>
  );

  const stateDiagram = stateMachine && showStateDiagram ? (
    <StateDiagram
      graph={stateMachine.graph}
      currentState={forceUnlocked && Object.hasOwn(stateMachine.graph, "forceUnlocked")
        ? "forceUnlocked" as StateId
        : stateMachine.currentState}
      layout={stateDiagramLayout}
    />
  ) : null;

  const prerequisites = showStateDiagram && baseCardContext.prerequisiteIds.some((id) => id.trim())
    ? prerequisiteTree(appContext, baseCardContext)
    : null;
  const prerequisitesDiagram = prerequisites ? (
    <StateDiagram
      graph={prerequisites.graph}
      currentState={cardId}
      layout={prerequisites.layout}
      nodeTone={prerequisites.tones}
      dashedNodes={prerequisites.dashedNodes}
      ariaLabel={prerequisites.ariaLabel}
    />
  ) : null;

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
      {stateMachine && contextMenu && (
        <Menu
          open
          onClose={() => setContextMenu(null)}
          anchorReference="anchorPosition"
          anchorPosition={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
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
          {stateDiagram}
          {prerequisitesDiagram}
          {/* START CONTENT SECTION, render based on lifecycle state */}
          {lifecycle === "loading" ? loadingContent ?? defaultLoadingContent
            : lifecycle === "blocked" ? defaultBlockedContent
              : (/* ONLY RENDER THIS SECTION IF NOT LOADING OR BLOCKED */
                <>
                  {lifecycle === "forceUnlocked" && forceUnlockNotice}
                  {children}
                </>
              )}
        </Box>
      </Collapse>
    </Box>
  );
}

// The card and every card under it. Prerequisites sit left of the cards that need them, so arrows run left to right;
// a card's column is its longest chain of prerequisites. A card's lifecycle shows on hover.
function prerequisiteTree(
  appContext: ReturnType<AppContext["getSnapshot"]> | undefined,
  { cardId, title, lifecycle, prerequisiteIds }: BaseCardContext<string>,
) {
  const cards = new Map<string, { label: string; status: string; needs: string[] }>();
  const visit = (id: string, label: string, status: string, prerequisites: readonly string[]) => {
    if (cards.has(id)) return; // Already drawn, or a cycle back to it.
    const needs = prerequisites.map((prerequisite) => prerequisite.trim()).filter(Boolean);
    cards.set(id, { label, status, needs });
    for (const prerequisite of needs) {
      const entry = appContext?.cards[prerequisite as keyof typeof appContext.cards];
      if (entry?.initialised) visit(prerequisite, entry.title, entry.currentBaseCardStatus, entry.prerequisiteIds ?? []);
      else visit(prerequisite, prerequisite, "not registered", []);
    }
  };
  visit(cardId, title, lifecycle, prerequisiteIds);

  const columns = new Map<string, number>();
  const column = (id: string, path: Set<string>): number => {
    const known = columns.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 0; // A cycle: its arrow is drawn, but it doesn't push the card further right.
    path.add(id);
    const value = Math.max(-1, ...cards.get(id)!.needs.map((need) => column(need, path))) + 1;
    path.delete(id);
    columns.set(id, value);
    return value;
  };
  cards.forEach((_, id) => column(id, new Set()));

  const dependents = new Map<string, string[]>([...cards.keys()].map((id) => [id, []]));
  cards.forEach(({ needs }, id) => needs.forEach((need) => dependents.get(need)!.push(id)));
  const graph: StateGraph<string, string> = Object.fromEntries([...cards].map(([id, { label, status }]) =>
    [id, { label, baseCardLifecycle: status, transitions: dependents.get(id)! }]));

  // Tighter than StateDiagram's own layout so four columns of card titles fit an expanded card without scrolling.
  const nodeWidth = 176, nodeHeight = 40, gapX = 48, gapY = 24, padding = 24, fontSize = 12;
  const byColumn: string[][] = [];
  columns.forEach((index, id) => (byColumn[index] ??= []).push(id));
  const tallest = Math.max(...byColumn.map((ids) => ids.length));
  // An arrow that skips a column runs above every card in its own lane, so it never crosses a card or another arrow.
  const edges = [...cards].flatMap(([id, { needs }]) => needs.map((need) => ({ from: need, to: id })));
  const skipping = edges.filter(({ from, to }) => columns.get(to)! - columns.get(from)! > 1);
  const laneGap = 14;
  const top = padding + (skipping.length ? skipping.length * laneGap + 8 : 0);
  const width = padding * 2 + byColumn.length * nodeWidth + (byColumn.length - 1) * gapX;
  const height = top + padding + tallest * nodeHeight + (tallest - 1) * gapY;
  const positions: Record<string, { x: number; y: number }> = {};
  byColumn.forEach((ids, index) => {
    const columnHeight = ids.length * nodeHeight + (ids.length - 1) * gapY;
    ids.forEach((id, row) => {
      positions[id] = {
        x: padding + nodeWidth / 2 + index * (nodeWidth + gapX),
        y: top + (height - top - padding - columnHeight) / 2 + nodeHeight / 2 + row * (nodeHeight + gapY),
      };
    });
  });
  // Out of a card's right side and into the next one's left, bending only in the gap between columns.
  // A cycle's arrow points back left; StateDiagram draws that one itself.
  const edgePaths = edges.filter(({ from, to }) => columns.get(to)! > columns.get(from)!).map(({ from, to }) => {
    const start = { x: positions[from].x + nodeWidth / 2, y: positions[from].y };
    const end = { x: positions[to].x - nodeWidth / 2, y: positions[to].y };
    const lane = skipping.findIndex((edge) => edge.from === from && edge.to === to);
    const path = lane < 0
      ? `M ${start.x} ${start.y} C ${start.x + gapX / 2} ${start.y}, ${end.x - gapX / 2} ${end.y}, ${end.x} ${end.y}`
      : (() => {
        const laneY = padding + lane * laneGap;
        return `M ${start.x} ${start.y} C ${start.x + gapX / 2} ${start.y}, ${start.x + gapX / 2} ${laneY}, ${start.x + gapX} ${laneY}`
          + ` L ${end.x - gapX} ${laneY} C ${end.x - gapX / 2} ${laneY}, ${end.x - gapX / 2} ${end.y}, ${end.x} ${end.y}`;
      })();
    return { from, to, path };
  });
  const ariaLabel = `Prerequisite tree. ${[...cards.values()]
    .map(({ label, status, needs }) => `${label} (${status}) needs ${needs.map((need) => cards.get(need)!.label).join(", ") || "nothing"}`)
    .join(". ")}`;
  // A prerequisite is green once complete; the card itself is green once every card above it is.
  const met = (id: string) => cards.get(id)!.status === "complete";
  const tones = Object.fromEntries([...cards.keys()].map((id) => [id,
    (id === cardId ? [...cards.keys()].every((other) => other === cardId || met(other)) : met(id)) ? "success" as const : "warning" as const]));
  // Cards the card doesn't list itself, found only through the tree.
  const listed = new Set(prerequisiteIds.map((id) => id.trim()));
  const dashedNodes = new Set([...cards.keys()].filter((id) => id !== cardId && !listed.has(id)));
  return { graph, layout: { width, height, nodeWidth, nodeHeight, fontSize, positions, edgePaths }, ariaLabel, tones, dashedNodes };
}
