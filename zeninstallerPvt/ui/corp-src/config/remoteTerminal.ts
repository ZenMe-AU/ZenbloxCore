/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Matches SESSION_TTL in the remote-login runner, so both sides expire together.
export const REMOTE_TERMINAL_TTL_SECONDS = 1800;

export const TERMINAL_COLS = 120;
export const TERMINAL_ROWS = 24;

export type TerminalMode = "light" | "dark";

export const TERMINAL_COLORS = {
  light: {
    panel: "#f8fafc",
    header: "#eef3f4",
    border: "#cbd5d8",
    text: "#1c2b30",
    muted: "#5e7075",
    accent: "#2563eb",
    green: "#15803d",
    yellow: "#a16207",
    red: "#b91c1c",
    surface: "#dce5e7",
    accentHover: "#1d4ed8",
    successBg: "#ecfdf3",
  },
  dark: {
    panel: "#1e1e2e",
    header: "#181825",
    border: "#313244",
    text: "#cdd6f4",
    muted: "#a6adc8",
    accent: "#89b4fa",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    red: "#f38ba8",
    surface: "#45475a",
    accentHover: "#74a0fc",
    successBg: "#1e3a1e",
  },
} as const;

export type TerminalColors = (typeof TERMINAL_COLORS)[TerminalMode];

// The subset xterm takes, derived rather than restated.
export const TERMINAL_THEME = {
  light: {
    background: TERMINAL_COLORS.light.panel,
    foreground: TERMINAL_COLORS.light.text,
    cursor: TERMINAL_COLORS.light.accent,
    selectionBackground: TERMINAL_COLORS.light.surface,
  },
  dark: {
    background: TERMINAL_COLORS.dark.panel,
    foreground: TERMINAL_COLORS.dark.text,
    cursor: TERMINAL_COLORS.dark.accent,
    selectionBackground: TERMINAL_COLORS.dark.surface,
  },
} as const;

// The runner names the stages; these are what the card shows for them.
const STAGE_LABELS: Record<string, string> = {
  connecting: "Connecting...",
  "azure-login": "Azure Login",
  "aws-login": "AWS Login",
  "terraform-init": "Terraform Init",
  "terraform-plan": "Terraform Plan",
  done: "Complete",
  error: "Error",
};

// An unknown stage shows as itself rather than blank, so a new runner stage is still readable.
export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}
