/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Theme } from "@mui/material";

export const box = { border: "1px solid", borderColor: "divider", borderRadius: 1, backgroundColor: "background.paper", overflow: "hidden" };
export const header = { width: "100%", justifyContent: "flex-start", gap: 1.25, px: 1.5, py: 1, textAlign: "left", "&:hover": { backgroundColor: "action.hover" } };
export const head = { color: "text.primary", fontWeight: 700 };
// A row's account table; narrower than a desktop, each account stacks, and a cell with a data-label shows it above the value.
export const accountTable = (minWidth: number) => (theme: Theme) => ({
  minWidth,
  tableLayout: "fixed" as const,
  [theme.breakpoints.down("md")]: {
    minWidth: 0,
    "& thead": { display: "none" },
    "& tr, & td": { display: "block" },
    "& tr": { py: 1, borderBottom: "1px solid", borderColor: "divider" },
    "& tr:last-of-type": { borderBottom: "none" },
    "& td": { borderBottom: "none", px: 0, py: 0.5 },
    "& td[data-label]::before": { content: "attr(data-label)", display: "block", color: "text.muted", typography: "caption" },
  },
});
export const circle = {
  width: 24,
  height: 24,
  flex: "none",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid",
  borderColor: "text.secondary",
  color: "text.secondary",
  typography: "body2",
};
