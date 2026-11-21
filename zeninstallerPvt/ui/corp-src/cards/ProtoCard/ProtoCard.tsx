/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, Checkbox, CircularProgress, Collapse, FormControlLabel, Link, Typography, useTheme, ButtonBase } from "@mui/material";
import BaseCard from "../../components/BaseCard";
import type { CardLifecycle } from "../../components/cardLifecycle";
import Prerequisites from "../../components/Prerequisites";
import ViewLink from "../../components/ViewLink";
import type { CardChrome } from "../../types";
import { canTransition, requirements, type RequirementId } from "./stateMachine";
import type { UseProtoCard } from "./useProtoCard";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

type Props = {
  card: CardChrome;
  protoCard: UseProtoCard;
};

const lifecycleNodes: { lifecycle: CardLifecycle; label: string; x: number; y: number }[] = [
  { lifecycle: "loading", label: "Loading", x: 100, y: 150 },
  { lifecycle: "blocked", label: "Blocked", x: 100, y: 300 },
  { lifecycle: "ready", label: "Ready", x: 290, y: 150 },
  { lifecycle: "action", label: "Action", x: 470, y: 150 },
  { lifecycle: "commit", label: "Commit", x: 650, y: 150 },
  { lifecycle: "complete", label: "Complete", x: 830, y: 150 },
  { lifecycle: "error", label: "Error", x: 470, y: 300 },
];

const lifecycleEdges: { from: CardLifecycle; to: CardLifecycle; path: string }[] = [
  { from: "loading", to: "ready", path: "M156 150 H234" },
  { from: "loading", to: "action", path: "M150 130 V75 H470 V130" },
  { from: "loading", to: "commit", path: "M140 130 V55 H650 V130" },
  { from: "loading", to: "blocked", path: "M92 170 V280" },
  { from: "blocked", to: "loading", path: "M108 280 V170" },
  { from: "ready", to: "action", path: "M346 150 H414" },
  { from: "ready", to: "error", path: "M290 170 L414 285" },
  { from: "action", to: "commit", path: "M526 150 H594" },
  { from: "action", to: "error", path: "M470 170 V280" },
  { from: "commit", to: "complete", path: "M706 150 H774" },
  { from: "commit", to: "error", path: "M650 170 L526 285" },
  { from: "complete", to: "loading", path: "M830 130 V25 H130 V130" },
  { from: "error", to: "loading", path: "M470 320 V365 H16 V150 H44" },
];

function UnlockedContent({ protoCard }: { protoCard: UseProtoCard }) {
  return (
    <>
      <Intro />
      <PrerequisitesPanel protoCard={protoCard} />
      {/* ============================================================
          START ACTION CONTENT HERE
          ============================================================ */}
      {/* ============================================================
          END ACTION CONTENT HERE
          ============================================================ */}
      <ResultsPanel lifecycle={protoCard.baseCardContext.lifecycle} />
    </>
  );
}

function PrerequisitesPanel({ protoCard }: { protoCard: UseProtoCard }) {
  const { appContext, baseCardContext, protoCardContext, dispatch } = protoCard;
  const state = { appContext, baseCardContext, protoCardContext };
  const lifecycle = baseCardContext.lifecycle;
  const [panel, setPanel] = useState({ lifecycle, open: lifecycle === "ready" });
  if (panel.lifecycle !== lifecycle) {
    setPanel({ lifecycle, open: panel.open || lifecycle === "ready" });
  }

  return (
    <Prerequisites id="proto-card-prerequisites" open={panel.open} onToggle={() => setPanel((value) => ({ ...value, open: !value.open }))}>
      {/* ============================================================
          START PREREQUISITES PANEL CONTENT HERE
          ============================================================ */}

      <Typography role="status" sx={{ mb: 1 }}>
        Lifecycle: {baseCardContext.lifecycle}
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Simulated lifecycle actions (no real operations). Highlighted is the current state; blocked and ready follow prerequisite checks automatically.
      </Typography>
      <Box role="region" aria-label="Lifecycle diagram" tabIndex={0} sx={{ overflowX: "auto", mb: 2 }}>
        <Box sx={{ position: "relative", width: 950, height: 390 }}>
          <svg
            width="950"
            height="390"
            viewBox="0 0 950 390"
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, color: "var(--mui-palette-text-secondary)" }}
          >
            <defs>
              <marker id="proto-lifecycle-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" fill="currentColor" />
              </marker>
            </defs>
            {lifecycleEdges.map(({ from, to, path }) => (
              <path
                key={`${from}-${to}`}
                data-from={from}
                data-to={to}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                markerEnd="url(#proto-lifecycle-arrow)"
              />
            ))}
          </svg>
          <Box className="visually-hidden">
            Loading leads to ready, action, commit or blocked. Blocked leads to loading. Ready leads to action, action leads to commit,
            and commit leads to complete. Ready, action and commit can each lead to error.
            Complete and error can return to loading.
          </Box>
          {lifecycleNodes.map(({ lifecycle, label, x, y }) => {
            const current = baseCardContext.lifecycle === lifecycle;
            return (
              <Button
                key={lifecycle}
                size="small"
                variant={current ? "contained" : "outlined"}
                aria-current={current ? "step" : undefined}
                disabled={!canTransition(state, lifecycle)}
                onClick={() => dispatch({ type: "transition", lifecycle })}
                sx={{
                  position: "absolute",
                  left: x - 56,
                  top: y - 20,
                  width: 112,
                  height: 40,
                  ...(current && {
                    "&.Mui-disabled": { backgroundColor: "primary.main", color: "primary.contrastText" },
                  }),
                }}
              >
                {label}
              </Button>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ mb: 2 }}>
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            dispatch({ type: "force-unlock", value: false });
            dispatch({ type: "requirement", id: "repo", completed: false });
          }}
        >
          Block
        </Button>
      </Box>
      <Typography>Changing simulated app state resets the lifecycle and rechecks prerequisites. Block marks the repository incomplete; force unlock does not complete prerequisites.</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <FormControlLabel
          label="Configuration available"
          control={<Checkbox checked={appContext.configured} onChange={(event) => dispatch({ type: "configuration", configured: event.target.checked })} />}
        />
        {(Object.keys(requirements) as RequirementId[]).map((id) => (
          <FormControlLabel
            key={id}
            label={requirements[id]}
            control={<Checkbox checked={appContext.completed[id]} onChange={(event) => dispatch({ type: "requirement", id, completed: event.target.checked })} />}
          />
        ))}
      </Box>
      {/* ============================================================
          END PREREQUISITES PANEL CONTENT HERE
          ============================================================ */}
    </Prerequisites>
  );
}

function ResultsPanel({ lifecycle }: { lifecycle: CardLifecycle }) {
  const [panel, setPanel] = useState({ lifecycle, open: lifecycle === "commit" });
  if (panel.lifecycle !== lifecycle) {
    setPanel({ lifecycle, open: panel.open || lifecycle === "commit" });
  }

  return (
    <Box>
      <ButtonBase
        disableRipple
        onClick={() => setPanel((value) => ({ ...value, open: !value.open }))}
        aria-expanded={panel.open}
        aria-controls="proto-card-results"
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          userSelect: "none",
          py: 0.25,
          "&:hover .plan-output-toggle-label, &:focus-visible .plan-output-toggle-label": { color: "primary.main" },
          "&:hover .plan-output-toggle-line, &:focus-visible .plan-output-toggle-line": { backgroundColor: "primary.main" },
          "&:hover .plan-output-toggle-icon, &:focus-visible .plan-output-toggle-icon": { color: "primary.main" },
        }}
      >
        <Box className="plan-output-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
        <Typography className="plan-output-toggle-label" sx={{ typography: "body1", color: "text.muted", whiteSpace: "nowrap", transition: "color 0.2s" }}>
          {panel.open ? "hide results" : "view results"}
        </Typography>
        <KeyboardArrowDownIcon
          className="plan-output-toggle-icon"
          sx={{
            typography: "body2",
            color: "text.muted",
            transform: panel.open ? "rotate(180deg)" : "none",
            transition: "color 0.2s, transform 0.2s",
          }}
          aria-hidden="true"
        />
        <Box className="plan-output-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
      </ButtonBase>
      <Collapse in={panel.open} timeout={300}>
        <Box id="proto-card-results" role="region" aria-label="Results">
          {/* ============================================================
              START RESULTS PANEL CONTENT HERE
              ============================================================ */}
          <Typography>
            Results content goes here.
          </Typography>
          {/* ============================================================
              END RESULTS PANEL CONTENT HERE
              ============================================================ */}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * The Intro will be displayed even if the card is blocked.
 */
function Intro() {
  return (
    <>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        The ProtoCard is a prototype card that shows how to implement new cards. It shows the 3 states of App, baseCard and Card context and lifecycles.
      </Typography>
    </>
  );
}

function LoadingContent() {
  return (
    <>
      <Intro />
      <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <CircularProgress size={20} aria-hidden="true" />
        <Typography>Loading...</Typography>
      </Box>
    </>
  );
}

function BlockedContent({ protoCard, onRequirementClick }: {
  protoCard: UseProtoCard;
  onRequirementClick: CardChrome["onRequirementClick"];
}) {
  const theme = useTheme();
  const colors = theme.vars.palette.card;

  return (
    <>
      <Box sx={{ mb: 2 }}><Intro /></Box>
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
        {!protoCard.appContext.configured && (
          <Typography role="status">The simulated configuration is unavailable.</Typography>
        )}
        <Typography
          sx={{
            typography: "body1",
            color: theme.vars.palette.text.secondary,
          }}
        >
          {protoCard.baseCardContext.unmetRequirements.length > 0
            ? "The following links will take you to the cards to complete first, or "
            : "You can "}
          <Link
            component="button"
            type="button"
            onClick={() => protoCard.dispatch({ type: "force-unlock", value: true })}
          >
            click here to force unlock this card.
          </Link>
        </Typography>
        {protoCard.baseCardContext.unmetRequirements.map((id) => (
          <ButtonBase
            key={id}
            component="button"
            onClick={() => onRequirementClick(id)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              width: "100%",
              justifyContent: "flex-start",
              cursor: "pointer",
              borderRadius: "6px",
              px: 0.75,
              py: 0.4,
              mx: -0.75,
              transition: "background 0.15s",
              "&:hover": { background: colors.requirementHover },
            }}
          >
            <ChevronRightIcon
              aria-hidden="true"
              sx={{ typography: "caption", color: colors.requirementText, flexShrink: 0 }}
            />
            <Typography
              component="span"
              className="req-label"
              sx={{ typography: "body1", color: colors.requirementText, fontWeight: 500 }}
            >
              {requirements[id]}
            </Typography>
          </ButtonBase>
        ))}
      </Box>
    </>
  );
}

export default function ProtoCard({ card, protoCard }: Props) {
  const { appContext, baseCardContext, protoCardContext } = protoCard;
  const { forceUnlocked } = protoCardContext;
  const showBlockedContent = baseCardContext.lifecycle === "blocked" && !forceUnlocked;

  return (
    <BaseCard
      cardId={card.cardId}
      title="Title of the card"
      summary={card.summary}
      lifecycle={baseCardContext.lifecycle}
      expanded={card.expanded}
      onToggle={card.onToggle}
      action={baseCardContext.lifecycle !== "loading" && !showBlockedContent
        ? <ViewLink href="http://localhost" label="Open External Site" />
        : undefined}
    >
      {baseCardContext.lifecycle === "loading"
        ? <LoadingContent />
        : showBlockedContent
          ? <BlockedContent protoCard={protoCard} onRequirementClick={card.onRequirementClick} />
          : (
            <>
              {forceUnlocked && baseCardContext.lifecycle === "blocked" && (
                <Typography role="status" color="warning.main" sx={{ mb: 2 }}>
                  This card is force-unlocked;{" "}
                  {!appContext.configured && "its configuration is unavailable"}
                  {!appContext.configured && baseCardContext.unmetRequirements.length > 0 && " and "}
                  {baseCardContext.unmetRequirements.length > 0 && "its prerequisites are still incomplete"}.
                </Typography>
              )}
              <UnlockedContent protoCard={protoCard} />
            </>
          )}
    </BaseCard>
  );
}
