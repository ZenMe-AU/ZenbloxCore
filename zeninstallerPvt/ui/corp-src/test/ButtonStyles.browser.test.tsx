/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it } from "vitest";
import { Button, ThemeProvider, ToggleButton } from "@mui/material";
import theme from "../theme";

describe("compact button styling", () => {
  it("keeps action and toggle controls on the shared size baseline", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <ThemeProvider
            theme={theme}
            defaultMode="light"
            modeStorageKey="zeninstaller-button-test-mode"
            colorSchemeStorageKey="zeninstaller-button-test-color-scheme"
          >
            <Button variant="contained">Primary action</Button>
            <Button variant="outlined">Secondary action</Button>
            <ToggleButton value="selected" selected>Selected mode</ToggleButton>
          </ThemeProvider>
        );
      });

      const buttons = [
        container.querySelector<HTMLButtonElement>("button.MuiButton-contained"),
        container.querySelector<HTMLButtonElement>("button.MuiButton-outlined"),
        container.querySelector<HTMLButtonElement>("button.MuiToggleButton-root"),
      ];
      expect(buttons.every(Boolean)).toBe(true);

      for (const button of buttons) {
        const styles = getComputedStyle(button!);
        expect(styles.minHeight).toBe("32px");
        expect(styles.paddingTop).toBe("4px");
        expect(styles.fontSize).toBe("14px");
        expect(styles.borderRadius).toBe("6px");
      }
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });
});