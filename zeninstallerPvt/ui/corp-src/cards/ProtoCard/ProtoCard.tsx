/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useRef, useState, type ReactElement } from "react";
import { stringify } from "yaml";
import { Box, Button, TextField, Typography } from "@mui/material";
import type { AppContext } from "../../appContext";
import BaseCard from "../../components/BaseCard";
import type { BaseCardContext, Lifecycle } from "../../components/useBaseCard";
import CollapsiblePanel from "../../components/CollapsiblePanel";
import ViewLink from "../../components/ViewLink";
import { canTransition } from "./stateMachine";
import type { UseProtoCard } from "./useProtoCard";
import { useProtoCard } from "./useProtoCard";

const lifecycleNodes: { lifecycle: Lifecycle; label: string; x: number; y: number }[] = [
  { lifecycle: "loading", label: "Loading", x: 100, y: 150 },
  { lifecycle: "blocked", label: "Blocked", x: 100, y: 300 },
  { lifecycle: "ready", label: "Ready", x: 290, y: 150 },
  { lifecycle: "action", label: "Action", x: 470, y: 150 },
  { lifecycle: "commit", label: "Commit", x: 650, y: 150 },
  { lifecycle: "complete", label: "Complete", x: 830, y: 150 },
  { lifecycle: "error", label: "Error", x: 470, y: 300 },
  { lifecycle: "forceUnlocked", label: "Force unlocked", x: 290, y: 300 },
];

const lifecycleEdges: { from: Lifecycle; to: Lifecycle; path: string }[] = [
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
  { from: "blocked", to: "forceUnlocked", path: "M156 300 H234" },
  { from: "forceUnlocked", to: "blocked", path: "M234 312 H156" },
];

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

function PrerequisitesPanel({ baseCardContext, privateContext }: UseProtoCard) {
  const { appContext, dispatch } = privateContext;
  const state = { lifecycle: baseCardContext.lifecycle, baseCardContext };
  const lifecycle = baseCardContext.lifecycle;
  const registeredCards = Object.entries(appContext.cards)
    .filter(([cardId]) => cardId !== baseCardContext.cardId)
    .map(([cardId, card]) => ({
      id: cardId as BaseCardContext["cardId"],
      label: card?.initialised ? `${card.title} (${cardId})` : cardId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const [panel, setPanel] = useState({ lifecycle, open: lifecycle === "ready" });
  if (panel.lifecycle !== lifecycle) {
    setPanel({ lifecycle, open: panel.open || lifecycle === "ready" });
  }

  return (
    <CollapsiblePanel label="Prerequisites" id="proto-card-prerequisites" open={panel.open} onToggle={() => setPanel((value) => ({ ...value, open: !value.open }))}>
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
      <Typography>Select cards to set them as prerequisites for this card.</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
        {([0, 1] as const).map((index) => (
          <TextField
            key={index}
            select
            SelectProps={{ native: true }}
            slotProps={{ inputLabel: { shrink: true } }}
            label={`Prerequisite card ${index + 1}`}
            value={baseCardContext.prerequisiteIds[index]}
            onChange={(event) => dispatch({ type: "card-prerequisite", index, cardId: event.target.value })}
            size="small"
          >
            <option value="">No prerequisite</option>
            {registeredCards.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </TextField>
        ))}
      </Box>
      {/* ============================================================
          END PREREQUISITES PANEL CONTENT HERE
          ============================================================ */}
    </CollapsiblePanel>
  );
}

function ResultsPanel({ baseCardContext, privateContext }: UseProtoCard) {
  const { appContext } = privateContext;
  const lifecycle = baseCardContext.lifecycle;
  const [panel, setPanel] = useState({ lifecycle, open: lifecycle === "commit" });
  const [widths, setWidths] = useState([100 / 3, 100 / 3, 100 / 3]);
  const columnsRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; x: number } | null>(null);
  if (panel.lifecycle !== lifecycle) {
    setPanel({ lifecycle, open: panel.open || lifecycle === "commit" });
  }

  function resizeColumns(index: number, change: number) {
    setWidths((previous) => {
      const widths = [...previous];
      const total = widths[index] + widths[index + 1];
      widths[index] = Math.max(15, Math.min(total - 15, widths[index] + change));
      widths[index + 1] = total - widths[index];
      return widths;
    });
  }

  const contexts = [
    { name: "privateContext", value: {} },
    { name: "baseCardContext", value: baseCardContext },
    { name: "appContext", value: appContext },
  ];

  return (
    <CollapsiblePanel label="Results" id="proto-card-results" open={panel.open} onToggle={() => setPanel((value) => ({ ...value, open: !value.open }))}>
      {/* ============================================================
          START RESULTS PANEL CONTENT HERE
          ============================================================ */}
      <Typography variant="caption" color="text.secondary">
        Drag the separators or use the arrow keys to resize columns.
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Box ref={columnsRef} sx={{ display: "flex", minWidth: 540 }}>
          {contexts.map(({ name, value }, index) => (
            <Box key={name} sx={{ flex: `0 0 ${widths[index]}%`, minWidth: 0, position: "relative" }}>
              <Box
                role="region"
                aria-label={`${name} YAML`}
                tabIndex={0}
                sx={{ overflowX: "auto", px: 1, border: 1, borderColor: "divider", height: "100%", boxSizing: "border-box" }}
              >
                <Typography component="h4" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{name}</Typography>
                <Box component="pre" data-sensitive={name === "appContext" || undefined} sx={{ m: 0, pb: 1, whiteSpace: "pre" }}>
                  {stringify(value, { lineWidth: 0 })}
                </Box>
              </Box>
              {index < contexts.length - 1 && (
                <Box
                  role="separator"
                  aria-label={`Resize ${name} column`}
                  aria-orientation="vertical"
                  aria-valuemin={15}
                  aria-valuemax={Math.round(widths[index] + widths[index + 1] - 15)}
                  aria-valuenow={Math.round(widths[index])}
                  tabIndex={0}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { index, x: event.clientX };
                  }}
                  onPointerMove={(event) => {
                    if (drag.current?.index !== index || !columnsRef.current) return;
                    const change = (event.clientX - drag.current.x) / columnsRef.current.clientWidth * 100;
                    drag.current.x = event.clientX;
                    resizeColumns(index, change);
                  }}
                  onLostPointerCapture={() => { drag.current = null; }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    resizeColumns(index, event.key === "ArrowLeft" ? -2 : 2);
                  }}
                  sx={{
                    position: "absolute", right: -5, top: 0, bottom: 0, width: 10, zIndex: 1,
                    cursor: "col-resize", touchAction: "none",
                    "&:hover, &:focus-visible": { backgroundColor: "primary.main", opacity: 0.5 },
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>
      {/* ============================================================
          END RESULTS PANEL CONTENT HERE
          ============================================================ */}
    </CollapsiblePanel>
  );
}

function CardContentMain({ baseCardContext, privateContext }: UseProtoCard) {
  return (
    <>
      <Intro />
      <PrerequisitesPanel baseCardContext={baseCardContext} privateContext={privateContext} />
      {/* ============================================================
          START ACTION CONTENT HERE
          ============================================================ */}
      {/* ============================================================
          END ACTION CONTENT HERE
          ============================================================ */}
      <ResultsPanel baseCardContext={baseCardContext} privateContext={privateContext} />
    </>
  );
}

const CardEntrypoint = (appCtx: AppContext): ReactElement => {
  const cardHook = useProtoCard(appCtx);
  return (
    <BaseCard
      baseCardContext={cardHook.baseCardContext}
      appContext={cardHook.privateContext.appContext}
      blockedIntro={<Intro />}
      action={<ViewLink href="http://localhost" label="Open External Site" />}
    >
      <CardContentMain baseCardContext={cardHook.baseCardContext} privateContext={cardHook.privateContext} />
    </BaseCard>
  );
}

export default CardEntrypoint;
