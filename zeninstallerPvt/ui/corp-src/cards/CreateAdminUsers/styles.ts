/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export const box = { border: "1px solid", borderColor: "divider", borderRadius: 1, backgroundColor: "background.paper", overflow: "hidden" };
export const header = { width: "100%", justifyContent: "flex-start", gap: 1.25, px: 1.5, py: 1, textAlign: "left", "&:hover": { backgroundColor: "action.hover" } };
export const head = { color: "text.primary", fontWeight: 700 };
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
