/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, ButtonBase, Collapse, IconButton, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import BlockIcon from "@mui/icons-material/Block";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTheme } from "@mui/material/styles";
import type { CardStatus, CardChrome } from "../types";
import { borderHoverTint, UI_FONT as uiFont } from "../config/styles";

const STATUS_LABEL: Record<CardStatus, string> = {
  idle: "Not started",
  loading: "In progress",
  complete: "Complete",
  warning: "Warning",
  error: "Error",
  skipped: "Skipped",
  unavailable: "Unavailable",
};

function StatusIcon({
  status,
  locked,
  iconColors,
  lockedIconColor,
}: {
  status: CardStatus;
  locked: boolean;
  iconColors: Record<CardStatus, string>;
  lockedIconColor: string;
}) {
  /*
   * Same muted grey as the blocked icon - unavailable is styled identically to
   * locked, the glyph is the only thing that tells them apart.
   */
  if (locked) return <BlockIcon aria-hidden="true" sx={{ fontSize: 16, color: lockedIconColor }} />;
  const c = iconColors[status];
  switch (status) {
    case "complete":
      return <CheckCircleIcon aria-hidden="true" sx={{ fontSize: 16, color: c }} />;
    case "unavailable":
    case "warning":
      return <WarningAmberIcon aria-hidden="true" sx={{ fontSize: 15, color: c }} />;
    case "error":
      return <ErrorOutlineIcon aria-hidden="true" sx={{ fontSize: 15, color: c }} />;
    default:
      return <RadioButtonUncheckedIcon aria-hidden="true" sx={{ fontSize: 14, color: c }} />;
  }
}

/*
 * summary: Result value (when complete) or short prompt (when actionable) shown on the card face.
 * locked: Prerequisites unmet - the card still expands, but shows the requirements instead of
 * live content. unavailable: Broken from the start (e.g. missing config), not something to
 * unlock - same muted chrome as `locked` but with a warning icon, and summary/content stay visible.
 */
type Props = CardChrome & {
  title: string;
  action?: React.ReactNode;
  lockedIntro?: React.ReactNode;
  children: React.ReactNode;
};

/*
 * Collapses to a compact summary, expands (accordion) to the full card. Unlike
 * StepWrapper, a locked card still expands — it shows what's missing instead of blocking.
 * Owns its own outer id/width — App just renders <Card {...cardProps(id)} title="…"> directly,
 * no separate wrapping Box.
 */
export default function Card({
  cardId,
  title,
  summary,
  status,
  locked,
  requirements,
  expanded,
  onToggle,
  onRequirementClick,
  action,
  lockedIntro,
  children,
}: Props) {
  const theme = useTheme();
  const colors = theme.palette.card;
  /*
   * locked and unavailable share the same muted chrome - the only visual
   * difference between them is the icon (padlock vs warning triangle).
   */
  const muted = locked || status === "unavailable";
  /*
   * Unlike locked, an unavailable card still shows its summary - that IS the
   * "here's what's wrong" message, not a prerequisite result worth hiding.
   */
  const showSummary = !expanded && !!summary && !locked;
  const titleId = `card-title-${cardId}`;
  const contentId = `card-content-${cardId}`;

  return (
    <Box
      id={`card-${cardId}`}
      sx={{
        boxSizing: "border-box",
        width: "100%",
        gridColumn: expanded ? "1 / -1" : "auto",
        maxWidth: "100%",
        border: "1px solid",
        borderColor: muted ? theme.palette.divider : colors.border[status],
        borderRadius: "10px",
        background: muted ? colors.mutedBackground : theme.palette.background.paper,
        overflow: "hidden",
        boxShadow: colors.shadow,
        transition: "width 0.25s ease, border-color 0.2s, background 0.2s, box-shadow 0.2s",
        "&:hover": { boxShadow: colors.hoverShadow },
      }}
    >
      {/*
       * Header (always clickable, even when locked/unavailable) — single flex row with a
       * consistent base height so cards align whether or not they have a summary.
       */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 2,
          py: 1.5,
          minHeight: 80,
          boxSizing: "border-box",
          "&:hover": {
            background: borderHoverTint(muted ? theme.palette.divider : colors.border[status]),
          },
        }}
      >
        <Typography
          component="h3"
          id={titleId}
          sx={{ flex: 1, minWidth: 0, m: 0, fontSize: "inherit", fontWeight: "inherit" }}
        >
          <ButtonBase
            disableRipple
            aria-label={`${title}, ${locked ? "Locked" : STATUS_LABEL[status]}`}
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={onToggle}
            sx={{
              display: "flex",
              width: "100%",
              minWidth: 0,
              justifyContent: "flex-start",
              gap: 1.25,
              textAlign: "left",
              "&.Mui-focusVisible": {
                outline: "2px solid #93c5fd",
                outlineOffset: 2,
                borderRadius: "8px",
                boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
              },
            }}
          >
            <StatusIcon status={status} locked={locked} iconColors={colors.icon} lockedIconColor={colors.lockedIcon} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                component="span"
                sx={{
                  display: "block",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: muted ? colors.mutedText : theme.palette.text.primary,
                  ...uiFont,
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={title}
              >
                {title}
              </Typography>
              {showSummary && (
                <Typography
                  component="span"
                  sx={{
                    display: "block",
                    fontSize: "1rem",
                    color: colors.summary[status],
                    ...uiFont,
                    mt: 0.25,
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                  }}
                  title={summary}
                >
                  {summary}
                </Typography>
              )}
            </Box>
          </ButtonBase>
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
          {expanded && !muted && action}
          <IconButton
            disableRipple
            size="small"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={onToggle}
            sx={{
              color: colors.mutedIcon,
              "&:hover": { color: colors.mutedIconHover },
              "&.Mui-focusVisible": {
                outline: "2px solid #93c5fd",
                outlineOffset: 1,
                borderRadius: "50%",
                boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
              },
            }}
          >
            {expanded ? (
              <ExpandLessIcon fontSize="small" aria-hidden="true" />
            ) : (
              <ExpandMoreIcon fontSize="small" aria-hidden="true" />
            )}
          </IconButton>
        </Box>
      </Box>

      {/*
       * Content - a locked card can show read-only intro copy, then what's missing,
       * without rendering the unusable interactive content underneath it.
       */}
      <Collapse in={expanded}>
        <Box
          id={contentId}
          role="region"
          aria-labelledby={titleId}
          sx={{ borderTop: `1px solid ${colors.contentDivider}`, px: 2.5, py: 2.5 }}
        >
          {locked ? (
            <>
              {lockedIntro && <Box sx={{ mb: 2 }}>{lockedIntro}</Box>}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.75,
                  px: 1.75,
                  py: 1.5,
                  background: colors.requirementPanel,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: "8px",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "1rem",
                    color: theme.palette.text.secondary,
                    ...uiFont,
                  }}
                >
                  Complete these first
                </Typography>
                {requirements.map((r) => (
                  <ButtonBase
                    key={r.label}
                    component="button"
                    onClick={() => onRequirementClick(r.target)}
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
                      "&:hover .req-label": { textDecoration: "underline" },
                    }}
                  >
                    <ChevronRightIcon
                      aria-hidden="true"
                      sx={{ fontSize: 15, color: colors.requirementText, flexShrink: 0 }}
                    />
                    <Typography
                      component="span"
                      className="req-label"
                      sx={{ fontSize: "1rem", color: colors.requirementText, fontWeight: 500 }}
                    >
                      {r.label}
                    </Typography>
                  </ButtonBase>
                ))}
              </Box>
            </>
          ) : (
            children
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
