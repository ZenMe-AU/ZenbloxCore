/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Box, Button, ThemeProvider, ToggleButton } from "@mui/material";
import PrivateFrontendInfraCard from "../cards/PrivateFrontendInfra/PrivateFrontendInfraCard";
import RemoteTerminalInfraCard from "../cards/RemoteTerminalInfra/RemoteTerminalInfraCard";
import type { SetupStep } from "../types";
import theme from "../theme";

describe("compact button styling", () => {
  for (const mode of ["light", "dark"] as const) {
    for (const width of [1280, 390]) {
      it(`keeps disabled controls distinct and scheme-aware in ${mode} at ${width}px`, async () => {
        await page.viewport(width, 900);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const storageKey = `disabled-controls-${mode}-${width}`;
        localStorage.removeItem(storageKey);
        try {
          flushSync(() => root.render(<ThemeProvider theme={theme} defaultMode={mode} modeStorageKey={storageKey}>
            <Box sx={{ bgcolor: "background.paper", p: 2 }}>
              <Box data-id="disabled-reference" sx={{ bgcolor: "action.disabledBackground", color: "text.disabled" }}>Reference</Box>
              <Button variant="contained" disabled>Unavailable action</Button>
              <Button variant="outlined" disabled>Unavailable secondary</Button>
            </Box>
          </ThemeProvider>));
          await expect.poll(() => document.documentElement.getAttribute("data-mui-color-scheme")).toBe(mode);
          const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
          const reference = getComputedStyle(container.querySelector('[data-id="disabled-reference"]')!);
          await expect.poll(() => getComputedStyle(buttons[0]).backgroundColor).toBe(reference.backgroundColor);
          await expect.poll(() => getComputedStyle(buttons[0]).color).toBe(reference.color);
          const contained = getComputedStyle(buttons[0]);
          expect(contained.backgroundImage).toBe("none");
          expect(contained.backgroundColor).toBe(reference.backgroundColor);
          expect(contained.color).toBe(reference.color);
          for (const button of buttons) {
            expect(button.disabled).toBe(true);
            expect(getComputedStyle(button).pointerEvents).toBe("none");
            expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(32);
            expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(width);
          }
          expect(getComputedStyle(buttons[1]).borderTopStyle).toBe("solid");
          expect(contained.color).not.toBe(contained.backgroundColor);
        } finally {
          flushSync(() => root.unmount());
          container.remove();
          localStorage.removeItem(storageKey);
          await page.viewport(1280, 720);
        }
      });
    }
  }

  for (const width of [1280, 390]) {
    for (const done of [false, true]) {
      it(`keeps environment ${done ? "rerun" : "create"} actions spaced and shows retry guidance after starting at ${width}px`, async () => {
        await page.viewport(width, 900);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const run = vi.fn(async () => {});
        const infra = {
          done, status: done ? "complete" as const : "idle" as const,
          steps: [] as SetupStep[], running: false, run, reset: vi.fn(), runNonce: 0,
          location: "australiaeast", setLocation: vi.fn(),
          locations: [], locationsLoading: false,
          resourceGroupName: "test-private-rg", lawName: "test-private-law",
          result: null, resultMatches: false,
        };
        const commonProps = {
          subscriptionId: "test-subscription", githubAccount: null,
          repoName: "test-repo", selectedEnv: null,
          variables: {
            values: {}, loading: false, refreshing: false, error: false,
            onRefresh: async () => {}, onConfirmed: vi.fn(),
          },
        };
        const chrome = {
          status: infra.status, locked: false, requirements: [], unavailable: false,
          expanded: true, onToggle: vi.fn(), onRequirementClick: vi.fn(),
        };

        const render = () => flushSync(() => root.render(
            <ThemeProvider theme={theme} defaultMode="light">
              <Button variant="contained">Reference action</Button>
              <PrivateFrontendInfraCard
                {...commonProps}
                card={{ ...chrome, cardId: "private_frontend_infra" }}
                infra={{
                  ...infra, cardId: "private_frontend_infra", locationsError: null,
                  siteStorageAccount: "testsite", setSiteStorageAccount: vi.fn(),
                  siteStorageChecking: false, siteStorageError: null,
                  checkSiteStorageAccount: async () => true, webStorageAccountName: "testsite",
                }}
              />
              <RemoteTerminalInfraCard
                {...commonProps}
                card={{ ...chrome, cardId: "remote_terminal_infra" }}
                infra={{
                  ...infra, cardId: "remote_terminal_infra", locationsFailed: false,
                  storageAccountName: "testapi", setStorageAccount: vi.fn(),
                  storageChecking: false, storageError: null, checkStorageAccount: async () => true,
                  webPubSubName: "testpubsub", setWebPubSub: vi.fn(),
                  webPubSubChecking: false, webPubSubError: null, checkWebPubSub: async () => true,
                  functionAppName: "testfunction", setFunctionApp: vi.fn(),
                  functionAppChecking: false, functionAppError: null, checkFunctionApp: async () => true,
                  appInsightsName: "test-insights", hubName: "test-hub", pipelineAppName: "test-pipeline",
                }}
              />
            </ThemeProvider>
          ));

        try {
          render();
          expect(container.querySelectorAll('[role="note"]')).toHaveLength(0);
          const buttons = [...container.querySelectorAll<HTMLButtonElement>("button.MuiButton-contained")]
            .filter((button) => !button.closest('[aria-label="Connection details"]'));
          expect(buttons.map((button) => button.textContent)).toEqual([
            "Reference action",
            done ? "Re-run" : "Create frontend hosting environment",
            done ? "Re-run" : "Create backend environment",
          ]);
          const reference = getComputedStyle(buttons[0]);
          for (const button of buttons.slice(1)) {
            const actionRow = button.parentElement!;
            const resources = button.previousElementSibling!;
            const styles = getComputedStyle(button);
            expect(getComputedStyle(actionRow).rowGap).toBe("12px");
            expect(button.getBoundingClientRect().top - resources.getBoundingClientRect().bottom).toBeCloseTo(12, 1);
            expect(styles.paddingTop).toBe(reference.paddingTop);
            expect(styles.paddingBottom).toBe(reference.paddingBottom);
            expect(styles.paddingLeft).toBe(reference.paddingLeft);
            expect(styles.paddingRight).toBe(reference.paddingRight);
            expect(styles.minHeight).toBe(reference.minHeight);
            expect(styles.alignSelf).toBe("flex-start");
            expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(width);
            button.click();
          }
          expect(run).toHaveBeenCalledTimes(2);

          for (const status of ["running", "error", "done"] as const) {
            infra.steps = [{ id: "resource-group", label: "Create resource group", status }];
            infra.running = status === "running";
            render();
            for (const cardId of ["private_frontend_infra", "remote_terminal_infra"]) {
              const card = container.querySelector(`#card-${cardId}`)!;
              const notices = card.querySelectorAll('[role="note"]');
              expect(notices).toHaveLength(1);
              expect(notices[0].textContent).toBe("If one or more steps fail, try running the process again.");
              const step = [...card.querySelectorAll("p")].find((element) => element.textContent === "Create resource group")!;
              expect(step.compareDocumentPosition(notices[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            }
          }
          infra.steps = [];
          render();
          expect(container.querySelectorAll('[role="note"]')).toHaveLength(0);
        } finally {
          flushSync(() => root.unmount());
          container.remove();
          await page.viewport(1280, 720);
        }
      });
    }
  }

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