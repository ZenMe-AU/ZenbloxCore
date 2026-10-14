/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/*
 * Shared UI style tokens for the corp installer, pulled out of the ~12 card/
 * component files that each redeclared their own identical copies.
 */

// Shared face for ordinary interface text.
export const UI_FONT = { fontFamily: "sans-serif" } as const;
export const MONO_FONT = { fontFamily: "monospace" } as const;

export const borderHoverTint = (borderColor: string) => `color-mix(in srgb, ${borderColor} 20%, white)`;

// Slim "Refresh" text button used by every card that re-fetches remote state.
export const refreshBtnSx = {
  flexShrink: 0,
  color: "#94a3b8",
  fontSize: "1rem",
  textTransform: "none" as const,
  ...UI_FONT,
  "&:hover": { color: "#475569" },
};

// Small uppercase field label used by the Azure / domain / terraform setup cards.
export const labelSx = {
  fontSize: "1rem",
  color: "#94a3b8",
  ...UI_FONT,
};

/*
 * Uppercase section heading. Defaults to the dark (#0f172a) variant;
 * EnvSecretsDetail overrides `color` to the muted #94a3b8.
 */
export const sectionLabelSx = {
  fontSize: "1rem",
  fontWeight: 700,
  color: "#0f172a",
  ...UI_FONT,
};
