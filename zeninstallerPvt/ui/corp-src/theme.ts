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
  interface TypographyVariants {
    fieldLabel: CSSProperties;
    sectionLabel: CSSProperties;
  }

  interface TypographyVariantsOptions {
    fieldLabel?: CSSProperties;
    sectionLabel?: CSSProperties;
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
  }
}

const theme = createTheme({
  cssVariables: true,
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
        idle: "#ea580c",
        loading: "#64748b",
        complete: "#16a34a",
        warning: "#ea580c",
        error: "#dc2626",
        skipped: "#64748b",
        unavailable: "#64748b",
      },
      mutedBackground: "#f8fafc",
      mutedText: "#94a3b8",
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
      letterSpacing: "0.06em",
    },
    fieldLabel: {
      fontSize: "1rem",
      fontWeight: 600,
      lineHeight: 1.4,
      color: "#475569",
    },
    sectionLabel: {
      fontSize: "1rem",
      fontWeight: 700,
      lineHeight: 1.4,
      color: "#0f172a",
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
            backgroundColor: "#f1f5f9",
            color: "#cbd5e1",
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
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.primary.main },
            },
            '&[data-editor-state="dirty"] .MuiOutlinedInput-notchedOutline': { borderColor: "#fbbf24" },
            '&[data-editor-state="error"] .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.error.light,
            },
            "& .MuiInputBase-input": { py: "5px", px: "10px" },
            "& .MuiInputBase-input::placeholder": { color: "#94a3b8", opacity: 1 },
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
        underline: "hover",
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