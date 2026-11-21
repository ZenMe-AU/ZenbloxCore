/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, Checkbox, FormControlLabel, Link, Typography, useTheme, ButtonBase } from "@mui/material";
import Card from "../../components/Card";
import type { CardLifecycle } from "../../components/cardLifecycle";
import ViewLink from "../../components/ViewLink";
import type { CardChrome } from "../../types";
import { canTransition, requirements, type RequirementId } from "./stateMachine";
import type { UseProtoCard } from "./useProtoCard";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

type Props = {
  card: CardChrome;
  protoCard: UseProtoCard;
};

const actions: { lifecycle: CardLifecycle; label: string }[] = [
  { lifecycle: "loading", label: "Start / retry" },
  { lifecycle: "complete", label: "Complete" },
  { lifecycle: "warning", label: "Needs action" },
  { lifecycle: "error", label: "Fail" },
  { lifecycle: "skipped", label: "Skip" },
  { lifecycle: "blocked", label: "Reset" },
];

/**
 * The Intro will be displayed even if the card is locked.
 */
function Intro() {
  return (
    <>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Intro for this card.
      </Typography>
    </>
  );
}

function LockedContent({ protoCard, onRequirementClick }: {
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
        <Typography
          sx={{
            typography: "body1",
            color: theme.vars.palette.text.secondary,
          }}
        >
          The following links will take you to the cards to complete first, or  <Link
            component="button"
            type="button"
            onClick={() => protoCard.dispatch({ type: "force-unlock", value: true })}
          >
            click here to force unlock this card.
          </Link>
        </Typography>
        {protoCard.cardContext.unmetRequirements.map((id) => (
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

function UnlockedContent({ protoCard }: { protoCard: UseProtoCard }) {
  const { appContext, cardContext, protoCardContext, dispatch } = protoCard;
  const state = { appContext, cardContext, protoCardContext };

  return (
    <>
      {protoCardContext.forceUnlocked && cardContext.unmetRequirements.length > 0 && (
        <Typography role="status" color="warning.main" sx={{ mb: 2 }}>
          This card is force-unlocked; its prerequisites are still incomplete.
        </Typography>
      )}
      <Intro />
      <Typography role="status" sx={{ mb: 1 }}>
        Availability: {cardContext.availability}; lifecycle: {cardContext.lifecycle}
      </Typography>
      {cardContext.availability === "unavailable" && (
        <Typography sx={{ mb: 1 }}>The simulated configuration is unavailable.</Typography>
      )}
      <Typography sx={{ mb: 1 }}>Simulated lifecycle actions (no real operations):</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {actions.map(({ lifecycle, label }) => (
          <Button
            key={lifecycle}
            size="small"
            variant="contained"
            disabled={!canTransition(state, lifecycle)}
            onClick={() => dispatch({ type: "transition", lifecycle })}
          >
            {label}
          </Button>
        ))}
        <Button
          size="small"
          variant="contained"
          disabled={cardContext.availability === "unavailable"}
          onClick={() => {
            dispatch({ type: "force-unlock", value: false });
            dispatch({ type: "requirement", id: "repo", completed: false });
          }}
        >
          Lock
        </Button>
      </Box>
      <Typography>Simulated app state (Lock marks the repository incomplete; force unlock does not complete prerequisites):</Typography>
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
    </>
  );
}

export default function ProtoCard({ card, protoCard }: Props) {
  const { cardContext, protoCardContext } = protoCard;
  const { forceUnlocked } = protoCardContext;

  return (
    <Card
      {...card}
      title="Title of the card"
      action={cardContext.availability === "available" || (cardContext.availability === "locked" && forceUnlocked)
        ? <ViewLink href="http://localhost" label="Open External Site" />
        : undefined}
    >
      {cardContext.availability === "locked" && !forceUnlocked
        ? <LockedContent protoCard={protoCard} onRequirementClick={card.onRequirementClick} />
        : <UnlockedContent protoCard={protoCard} />}
    </Card>
  );
}
