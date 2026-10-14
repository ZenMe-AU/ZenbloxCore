/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { UI_FONT as uiFont } from "./styles";

/*
 * App.tsx's own card-grid layout constants — not reused elsewhere, unlike
 * config/styles.ts's cross-file design tokens.
 */

/*
 * Cards fill the available row and wrap only when another column would become
 * narrower than the minimum readable card width. Expanded cards span the grid.
 */
export const CARD_MIN_W = 360;
export const EXPANDED_W = 1280;

export const groupLabelSx = {
  fontSize: "1rem",
  color: "#94a3b8",
  ...uiFont,
  mt: 3.5,
  mb: 1.25,
  textAlign: "left" as const,
};

export const groupSx = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, var(--card-w)), 1fr))",
  mt: 3.5,
  gap: 1.5,
  alignItems: "start",
} as const;
