/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import "./monitor/bootstrapErrors"; // keep on first line to catch errors during bootstrap
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import AccessPassApp from "./AccessPassApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AccessPassApp />
  </StrictMode>
);
