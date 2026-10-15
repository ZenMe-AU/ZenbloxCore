/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it } from "vitest";
import { TextField, ThemeProvider } from "@mui/material";
import Caption from "../components/Caption";
import CardIntro from "../components/CardIntro";
import ErrorText from "../components/ErrorText";
import ExternalLink from "../components/ExternalLink";
import FieldLabel from "../components/FieldLabel";
import StatusText from "../components/StatusText";
import theme from "../theme";

describe("shared UI building blocks", () => {
  it("keeps semantics, link behavior, and editor field states consistent", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <ThemeProvider theme={theme}>
            <CardIntro>Intro copy</CardIntro>
            <FieldLabel htmlFor="editor-base">Variable key</FieldLabel>
            <TextField id="editor-base" className="corpEditor" placeholder="not set" />
            <TextField id="editor-warning" className="corpEditor" data-editor-state="dirty" />
            <TextField id="editor-error" className="corpEditor" data-editor-state="error" error />
            <Caption>Supporting detail</Caption>
            <ErrorText>Request failed</ErrorText>
            <StatusText>Saved</StatusText>
            <ExternalLink href="https://example.com/docs" label="Documentation">
              Read documentation
            </ExternalLink>
          </ThemeProvider>
        );
      });

      const baseInput = container.querySelector<HTMLInputElement>("#editor-base");
      expect(baseInput?.labels?.[0]?.textContent).toBe("Variable key");
      expect(getComputedStyle(baseInput!).fontFamily).toContain("monospace");

      const outlineColor = (id: string) => {
        const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
        return getComputedStyle(input.parentElement!.querySelector("fieldset")!).borderTopColor;
      };
      expect(outlineColor("editor-base")).toBe("rgb(226, 232, 240)");
      expect(outlineColor("editor-warning")).toBe("rgb(251, 191, 36)");
      expect(outlineColor("editor-error")).toBe("rgb(239, 68, 68)");

      expect(container.querySelector('[role="alert"]')?.textContent).toBe("Request failed");
      expect(container.querySelector('[role="status"]')?.textContent).toBe("Saved");

      const link = container.querySelector<HTMLAnchorElement>('a[href="https://example.com/docs"]');
      expect(link?.target).toBe("_blank");
      expect(link?.rel).toBe("noopener noreferrer");
      expect(link?.getAttribute("aria-label")).toBe("Documentation (opens in new tab)");
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });
});