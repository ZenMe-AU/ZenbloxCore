/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createTheme } from "@mui/material/styles";
import type { CSSProperties } from "react";
import type { CardStatus } from "./types";

type CardStatusColors = Record<CardStatus, string>;
type CardPalette = {
  border: CardStatusColors;
  icon: CardStatusColors;
  summary: CardStatusColors;
  mutedBackground: string;
  mutedText: string;
  radius: string;
  shadow: string;
  hoverShadow: string;
  contentDivider: string;
  lockedIcon: string;
  mutedIcon: string;
  mutedIconHover: string;
  requirementPanel: string;
  requirementHover: string;
  requirementText: string;
};

declare module "@mui/material/styles" {
  interface CssThemeVariables {
    enabled: true;
  }

  interface TypographyVariants {
    fieldLabel: CSSProperties;
    sectionLabel: CSSProperties;
    technical: CSSProperties;
    technicalBody: CSSProperties;
  }

  interface TypographyVariantsOptions {
    fieldLabel?: CSSProperties;
    sectionLabel?: CSSProperties;
    technical?: CSSProperties;
    technicalBody?: CSSProperties;
  }

  interface TypeText {
    muted: string;
  }

  interface Palette {
    card: CardPalette;
  }

  interface PaletteOptions {
    card?: CardPalette;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    fieldLabel: true;
    sectionLabel: true;
    technical: true;
    technicalBody: true;
  }
}

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
  defaultColorScheme: "dark",
  colorSchemes: {
    light: {
      palette: {
        primary: {
          light: "#60a5fa",
          main: "#2563eb",
          dark: "#1d4ed8",
          contrastText: "#ffffff",
        },
        error: {
          light: "#ef4444",
          main: "#dc2626",
          dark: "#b91c1c",
          contrastText: "#ffffff",
        },
        warning: {
          light: "#ea580c",
          main: "#d97706",
          dark: "#b45309",
          contrastText: "#ffffff",
        },
        success: {
          light: "#22c55e",
          main: "#16a34a",
          dark: "#15803d",
          contrastText: "#ffffff",
        },
        info: {
          light: "#60a5fa",
          main: "#2563eb",
          dark: "#1d4ed8",
          contrastText: "#ffffff",
        },
        text: {
          primary: "#0f172a",
          secondary: "#475569",
          muted: "#64748b",
          disabled: "#64748b",
        },
        divider: "#e2e8f0",
        background: {
          default: "#f8fafc",
          paper: "#ffffff",
        },
        card: {
          border: {
            idle: "#fed7aa",
            loading: "#e2e8f0",
            complete: "#bbf7d0",
            warning: "#fed7aa",
            error: "#fecaca",
            skipped: "#f1f5f9",
            unavailable: "#e2e8f0",
          },
          icon: {
            idle: "#f97316",
            loading: "#60a5fa",
            complete: "#22c55e",
            warning: "#f97316",
            error: "#ef4444",
            skipped: "#94a3b8",
            unavailable: "#cbd5e1",
          },
          summary: {
            idle: "#b45309",
            loading: "#64748b",
            complete: "#15803d",
            warning: "#b45309",
            error: "#dc2626",
            skipped: "#64748b",
            unavailable: "#64748b",
          },
          mutedBackground: "#f8fafc",
          mutedText: "#94a3b8",
          radius: "10px",
          shadow: "0 1px 3px rgba(0,0,0,0.04)",
          hoverShadow: "0 4px 12px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.08)",
          contentDivider: "#f1f5f9",
          lockedIcon: "#cbd5e1",
          mutedIcon: "#cbd5e1",
          mutedIconHover: "#94a3b8",
          requirementPanel: "#f1f5f9",
          requirementHover: "#e0e7ff",
          requirementText: "#2563eb",
        },
      },
    },
    dark: {
      palette: {
        primary: {
          light: "#93c5fd",
          main: "#60a5fa",
          dark: "#3b82f6",
          contrastText: "#101820",
        },
        error: {
          light: "#fca5a5",
          main: "#f87171",
          dark: "#ef4444",
          contrastText: "#1b1111",
        },
        warning: {
          light: "#fdba74",
          main: "#fb923c",
          dark: "#f97316",
          contrastText: "#1c1711",
        },
        success: {
          light: "#86efac",
          main: "#4ade80",
          dark: "#22c55e",
          contrastText: "#101a13",
        },
        info: {
          light: "#93c5fd",
          main: "#60a5fa",
          dark: "#3b82f6",
          contrastText: "#101820",
        },
        text: {
          primary: "#e7edef",
          secondary: "#b3c0c3",
          muted: "#9aa9ac",
          disabled: "#819195",
        },
        divider: "#354448",
        background: {
          default: "#0f171a",
          paper: "#1b2629",
        },
        card: {
          border: {
            idle: "#704b30",
            loading: "#354448",
            complete: "#315b42",
            warning: "#704b30",
            error: "#704044",
            skipped: "#29383b",
            unavailable: "#354448",
          },
          icon: {
            idle: "#fb923c",
            loading: "#93c5fd",
            complete: "#4ade80",
            warning: "#fb923c",
            error: "#f87171",
            skipped: "#9aa9ac",
            unavailable: "#728287",
          },
          summary: {
            idle: "#fdba74",
            loading: "#9aa9ac",
            complete: "#86efac",
            warning: "#fdba74",
            error: "#fca5a5",
            skipped: "#9aa9ac",
            unavailable: "#9aa9ac",
          },
          mutedBackground: "#182326",
          mutedText: "#9aa9ac",
          radius: "10px",
          shadow: "0 1px 3px rgba(0,0,0,0.18)",
          hoverShadow: "0 4px 12px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)",
          contentDivider: "#29383b",
          lockedIcon: "#728287",
          mutedIcon: "#728287",
          mutedIconHover: "#a4b2b5",
          requirementPanel: "#202d30",
          requirementHover: "#263a3e",
          requirementText: "#93c5fd",
        },
      },
    },
  },
  typography: {
    fontFamily: "sans-serif",
    fontSize: 16,
    htmlFontSize: 16,
    h1: {
      fontSize: "1rem",
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h2: {
      fontSize: "0.875rem",
      fontWeight: 600,
      lineHeight: 1.35,
    },
    h3: {
      fontSize: "0.75rem",
      fontWeight: 600,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: "1rem",
      lineHeight: 1.55,
    },
    body2: {
      fontSize: "0.875rem",
      lineHeight: 1.5,
    },
    caption: {
      fontSize: "0.75rem",
      lineHeight: 1.4,
    },
    overline: {
      fontSize: "0.75rem",
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    fieldLabel: {
      fontSize: "1rem",
      fontWeight: 600,
      lineHeight: 1.4,
      color: "var(--mui-palette-text-secondary)",
    },
    sectionLabel: {
      fontSize: "1rem",
      fontWeight: 700,
      lineHeight: 1.4,
      color: "var(--mui-palette-text-primary)",
    },
    technical: {
      fontFamily: "monospace",
      fontSize: "0.75rem",
      lineHeight: 1.4,
    },
    technicalBody: {
      fontFamily: "monospace",
      fontSize: "1rem",
      lineHeight: 1.4,
    },
    button: {
      fontSize: "0.875rem",
      fontWeight: 600,
      textTransform: "none",
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          fontSize: "1rem",
          textTransform: "none",
        },
        contained: ({ theme }) => ({
          backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
          "&:hover": {
            backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.dark}, #1e40af)`,
          },
          "&.Mui-disabled": {
            backgroundImage: "none",
            backgroundColor: theme.palette.action.disabledBackground,
            color: theme.palette.text.disabled,
          },
        }),
      },
      variants: [
        {
          props: { color: "error", variant: "contained" },
          style: ({ theme }) => ({
            color: theme.palette.error.contrastText,
            backgroundImage: `linear-gradient(135deg, ${theme.palette.error.light}, ${theme.palette.error.main})`,
            "&:hover": {
              backgroundImage: `linear-gradient(135deg, ${theme.palette.error.main}, ${theme.palette.error.dark})`,
            },
          }),
        },
      ],
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
      variants: [
        {
          props: { className: "corpEditor" },
          style: ({ theme }) => ({
            "& .MuiOutlinedInput-root": {
              backgroundColor: theme.palette.background.default,
              color: theme.palette.text.primary,
              fontFamily: "monospace",
              fontSize: "1rem",
              borderRadius: "6px",
              "& .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.divider },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.divider },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.primary.main },
            },
            '&[data-editor-state="dirty"] .MuiOutlinedInput-notchedOutline': { borderColor: "#fbbf24" },
            '&[data-editor-state="error"] .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.error.light,
            },
            "& .MuiInputBase-input": { py: "5px", px: "10px" },
            "& .MuiInputBase-input::placeholder": { color: theme.palette.text.disabled, opacity: 1 },
          }),
        },
        {
          props: { className: "corpTechnicalInput" },
          style: {
            "& .MuiInputBase-input": { fontFamily: "monospace" },
          },
        },
      ],
    },
    MuiSelect: {
      defaultProps: {
        size: "small",
      },
    },
    MuiLink: {
      defaultProps: {
        underline: "always",
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          fontFamily: "sans-serif",
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: "1rem",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: "1rem",
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          fontSize: "1rem",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: "1rem",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: "1rem",
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          fontSize: "1rem",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontFamily: "sans-serif",
          fontSize: "1rem",
          fontWeight: 600,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
        elevation1: {
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.06)",
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          fontSize: "100%",
        },
        body: {
          fontSize: "1rem",
        },
        code: {
          fontFamily: "monospace",
        },
        pre: {
          fontFamily: "monospace",
        },
      },
    },
  },
});

export default theme;