/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface TypeText {
    muted: string;
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
      default: "#f4f6f8",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: "sans-serif, Arial",
    fontSize: 16,
    htmlFontSize: 16,
    h1: {
      fontSize: "1.375rem",
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h2: {
      fontSize: "1.125rem",
      fontWeight: 600,
      lineHeight: 1.35,
    },
    h3: {
      fontSize: "1rem",
      fontWeight: 600,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: "1rem",
      lineHeight: 1.55,
    },
    body2: {
      fontSize: "1rem",
      lineHeight: 1.5,
    },
    caption: {
      fontSize: "0.875rem",
      lineHeight: 1.4,
    },
    overline: {
      fontSize: "1rem",
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: "0.06em",
    },
    button: {
      fontSize: "1rem",
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
          },
        }),
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
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
          fontFamily: "sans-serif, Arial",
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
          fontFamily: "sans-serif, Arial",
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