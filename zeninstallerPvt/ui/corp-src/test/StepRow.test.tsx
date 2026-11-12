/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it } from "vitest";
import StepRow from "../cards/StepRow";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import theme from "../theme";

describe("StepRow permission guidance", () => {
  it.each([
    { detail: `Activate your eligible role at ${AZURE_PIM_ACTIVATION_URL} then retry.`, linked: true },
    { detail: "Existing setup error with no link", linked: false },
  ])("renders permission guidance with linked=$linked", async ({ detail, linked }) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <ThemeProvider theme={theme}>
            <StepRow step={{ id: "access", label: "Check subscription access", status: "error", detail }} />
          </ThemeProvider>
        );
      });
      const link = container.querySelector("a");
      if (linked) {
        expect(link?.getAttribute("href")).toBe(AZURE_PIM_ACTIVATION_URL);
        expect(link?.getAttribute("target")).toBe("_blank");
        expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
        expect(link?.getAttribute("aria-label")).toContain("Activate an Azure resource role in PIM");
        expect(container.textContent).toContain("then retry.");
      } else {
        expect(link).toBeNull();
        expect(container.textContent).toContain(detail);
      }
    } finally {
      await act(async () => root.unmount());
    }
  });
});
