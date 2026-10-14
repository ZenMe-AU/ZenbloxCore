/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import "./monitor/bootstrapErrors"; // keep on first line to catch errors during bootstrap
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import "./App.css";
import App from "./App.tsx";
import theme from "./theme";
import { CARD_MIN_W, EXPANDED_W } from "./config/cardLayout";

const rootElement = document.getElementById("root")!;
rootElement.style.setProperty("--card-w", `${CARD_MIN_W}px`);
rootElement.style.setProperty("--card-w-expanded", `${EXPANDED_W}px`);

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
