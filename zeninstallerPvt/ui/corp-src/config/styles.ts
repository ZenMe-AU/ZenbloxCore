/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/*
 * Shared UI style tokens for the corp installer, pulled out of the ~12 card/
 * component files that each redeclared their own identical copies.
 */

export const MONO_FONT = { fontFamily: "monospace" } as const;

export const borderTint = (borderColor: string, surfaceColor: string, percent: number) =>
  `color-mix(in srgb, ${borderColor} ${percent}%, ${surfaceColor})`;

export const borderHoverTint = (borderColor: string, surfaceColor: string) => borderTint(borderColor, surfaceColor, 20);

export const warningMessageIconSx = {
  fontSize: 16,
  flexShrink: 0,
  alignSelf: "center",
  verticalAlign: "middle",
} as const;

// Slim "Refresh" text button used by every card that re-fetches remote state.
export const refreshBtnSx = {
  flexShrink: 0,
  color: "text.muted",
  "&:hover": { color: "text.secondary" },
};

// Compatibility shims for cards migrating to theme typography variants.
export const labelSx = {
  typography: "fieldLabel",
};
