/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Box, Button, ThemeProvider, ToggleButton } from "@mui/material";
import CoreInfraCard from "../cards/CoreInfra/CoreInfraCard";
import { ensureHostingConsent, type UseCoreInfraCard } from "../cards/CoreInfra/useCoreInfraCard";
import type { UseTerraformStatePart } from "../cards/CoreInfra/useTerraformStatePart";
import type { UseDomainPart } from "../cards/CoreInfra/useDomainPart";
import type { UseFrontendPart } from "../cards/CoreInfra/useFrontendPart";
import type { UseBackendPart } from "../cards/CoreInfra/useBackendPart";
import type { AzureAccount, CardChrome, SetupStep } from "../types";
import type { CardResourceAccess } from "../hooks/util/useAzureCardAccess";
import theme from "../theme";
import type { ProvisionModule } from "../logic/provisioning";
import { useProvisioning } from "../hooks/util/useProvisioning";

const { consentMock } = vi.hoisted(() => ({ consentMock: vi.fn(async () => false) }));
// No token here, so the card's look-ups in Azure end at once as unknown.
vi.mock("../auth/msal", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureScopeConsent: consentMock,
  getToken: async () => {
    throw new Error("No Azure token in this test");
  },
}));

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
      it(`puts the hosting ${done ? "rerun" : "create"} action above the resources and keeps finished stages inspectable at ${width}px`, async () => {
        await page.viewport(width, 900);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const release = { current: () => {} };
        const finishing = new Promise<void>((resolve) => { release.current = resolve; });
        const resourceName = (name: string) => ({ name, apply: vi.fn(), check: async () => true, checking: false, error: null });
        const part = {
          done, status: done ? "complete" as const : "idle" as const,
          steps: [] as SetupStep[], running: false, reset: vi.fn(), runNonce: 0,
          resourceGroupName: "test-rg", lawName: "test-law",
          result: null, resultMatches: false, runProblem: null,
          creationAccess: { status: "ready", error: null, failureKind: null, retry: vi.fn(), check: vi.fn(), reportFailure: vi.fn(), missingRoles: null, missingEntra: null, unregisteredProviders: [], registeringProviders: false, registerProviders: async () => {}, missingConsent: [], grantConsent: vi.fn() } as CardResourceAccess,
        };
        const card: CardChrome = {
          cardId: "core_infra", status: part.status, locked: false, requirements: [], unavailable: false,
          expanded: true, onToggle: vi.fn(), onRequirementClick: vi.fn(),
        };
        // Four stages with one shared group each pair, like the real parts; the last task waits for the test.
        const step = (key: string, id?: string, wait = false) => ({ key, id, label: `Step ${key}`, run: async () => { if (wait) await finishing; return { status: "completed" as const }; } });
        const modules: ProvisionModule[] = [
          { id: "core_infra", label: "Core infrastructure", tasks: [step("rg", "core-rg"), step("storage")] },
          { id: "create_domain", label: "DNS & custom domain", tasks: [step("rg", "core-rg"), { ...step("dns"), run: async () => ({ status: "skipped" as const, detail: "ns1.example, ns2.example" }) }] },
          { id: "private_frontend_infra", label: "Frontend hosting", tasks: [step("rg", "private-rg"), step("site")] },
          { id: "remote_terminal_infra", label: "Backend infrastructure", tasks: [step("rg", "private-rg"), step("app", undefined, true)] },
        ];

        function Harness() {
          const provisioning = useProvisioning(modules);
          // The card hook's first run: consent, then every task.
          const run = async () => {
            if (!(await ensureHostingConsent({ tenantId: "test-tenant" } as AzureAccount, "test-tenant"))) await provisioning.run(true);
          };
          return (
            <ThemeProvider theme={theme} defaultMode="light">
              <Button variant="contained">Reference action</Button>
              <CoreInfraCard
                card={card}
                azureAccount={{ tenantId: "test-tenant" } as AzureAccount}
                corpName="test" dnsName="test.example.com" subscriptionId="test-subscription" tenantId="test-tenant" spClientId="test-client"
                githubAccount={null} repoName="test-repo" selectedEnv={null}
                variables={{ values: {}, loading: false, refreshing: false, error: false, onRefresh: async () => {}, onConfirmed: vi.fn() }}
                coreInfra={{ done, provisioning, run, reset: provisioning.reset,
                location: "australiaeast", setLocation: vi.fn(), locations: [], locationsLoading: false, locationsError: null, infra: {
                  ...part, provisioning: modules[0], infraRbacStatus: "unknown", containerName: "terraformstate",
                  storage: { ...resourceName("teststate"), error: "This name is taken somewhere in Azure", check: async (name: string) => name === "teststate" },
                } as unknown as UseTerraformStatePart,
                createDomain: { ...part, provisioning: modules[1], resourcesDone: done, checkingStatus: false, checkStatusError: null, nameServers: [] } as unknown as UseDomainPart,
                frontend: {
                  ...part, provisioning: modules[2],
                  siteStorage: resourceName("testsite"),
                } as unknown as UseFrontendPart,
                backend: {
                  ...part, provisioning: modules[3],
                  storage: resourceName("testapi"), webPubSub: resourceName("testpubsub"), functionApp: resourceName("testfunction"),
                  appInsightsName: "test-insights", pipelineAppName: "test-pipeline",
                } as unknown as UseBackendPart } as unknown as UseCoreInfraCard}
              />
            </ThemeProvider>
          );
        }

        const stageButtons = () => [...container.querySelectorAll<HTMLButtonElement>('[aria-controls^="deployment-stage-"]')];
        try {
          flushSync(() => root.render(<Harness />));
          expect(container.querySelectorAll('[role="note"]')).toHaveLength(0);
          // One button for the whole card: the parts have none of their own.
          const buttons = [...container.querySelectorAll<HTMLButtonElement>("button.MuiButton-contained")]
            .filter((button) => !button.closest('[aria-label="Results saved to GitHub"]') && !button.textContent?.startsWith("Save"));
          expect(buttons.map((button) => button.textContent)).toEqual(["Reference action", done ? "Re-run" : "Create private hosting environment"]);
          const [reference, button] = buttons.map((element) => getComputedStyle(element));
          for (const side of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "minHeight"] as const) expect(button[side]).toBe(reference[side]);

          // Create, then the resources, then the connection details; every original group and item is listed.
          const create = buttons[1];
          const resources = container.querySelector("section[aria-label^=\"Resources\"]")!;
          expect(create.compareDocumentPosition(resources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
          expect(resources.textContent).toContain("3 groups, 13 items");
          for (const name of ["teststate", "terraformstate", "test.example.com", "testsite", "testapi", "testpubsub", "testfunction", "test-insights", "test-pipeline"]) {
            expect(resources.textContent).toContain(name);
          }
          // Groups stack vertically at full width, never side by side.
          const groups = [...resources.querySelectorAll<HTMLElement>('[aria-controls^="resource-group-"]')].map((header) => header.closest<HTMLElement>(".MuiBox-root[class]")!.parentElement!);
          expect(groups).toHaveLength(3);
          const groupBoxes = [...resources.querySelectorAll<HTMLElement>('[role="region"]')].map((region) => region.getBoundingClientRect());
          for (let index = 1; index < groupBoxes.length; index++) expect(groupBoxes[index].top).toBeGreaterThan(groupBoxes[index - 1].top);
          expect(container.scrollWidth).toBeLessThanOrEqual(width);
          const details = container.querySelector('[aria-controls="private-hosting-connection-details"]')!;
          expect(resources.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
          expect(container.querySelector('[aria-label="Deployment details"]')).toBeNull();
          // No Actions column: the pencil follows the name; a check applies the edit and an undo drops it.
          expect([...resources.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(Array(3).fill(["Resource type", "Resource name", "Status"]).flat());
          const pencil = resources.querySelector<HTMLButtonElement>('button[aria-label^="Edit "]')!;
          const nameCell = pencil.closest("td")!;
          expect(nameCell.cellIndex).toBe(1);
          expect(nameCell.textContent).toBe("teststate");
          // The pencil, check and undo are centred on the text or box beside them.
          const middle = (element: Element) => {
            const box = element.getBoundingClientRect();
            return box.top + box.height / 2;
          };
          expect(Math.abs(middle(pencil) - middle(nameCell.querySelector(".corpTechnicalInput")!))).toBeLessThanOrEqual(1);
          pencil.click();
          await expect.poll(() => nameCell.querySelector('button[aria-label^="Undo "]')).not.toBeNull();
          expect([...nameCell.querySelectorAll("button")].map((control) => control.getAttribute("aria-label"))).toEqual(["Confirm Storage account name", "Undo Storage account name"]);
          expect(nameCell.textContent).not.toMatch(/Apply|Cancel|Generate/);
          // An open name is a draft, so Create waits until it is confirmed or undone.
          expect(create.disabled).toBe(true);
          for (const control of nameCell.querySelectorAll("button")) expect(Math.abs(middle(control) - middle(nameCell.querySelector(".MuiInputBase-root")!))).toBeLessThanOrEqual(1);
          // A taken name shows why under the box; Undo closes the edit and the message with it.
          expect(nameCell.textContent).not.toContain("taken");
          await userEvent.fill(nameCell.querySelector("input")!, "takenname");
          nameCell.querySelector<HTMLButtonElement>('button[aria-label^="Confirm "]')!.click();
          await expect.poll(() => nameCell.textContent).toContain("This name is taken somewhere in Azure");
          nameCell.querySelector<HTMLButtonElement>('button[aria-label^="Undo "]')!.click();
          await expect.poll(() => nameCell.querySelector("input")).toBeNull();
          expect(nameCell.textContent).toBe("teststate");
          expect(create.disabled).toBe(false);
          nameCell.querySelector<HTMLButtonElement>('button[aria-label^="Edit "]')!.click();
          await expect.poll(() => nameCell.querySelector("input")).not.toBeNull();
          expect(nameCell.textContent).not.toContain("taken");
          nameCell.querySelector<HTMLButtonElement>('button[aria-label^="Undo "]')!.click();
          await expect.poll(() => nameCell.querySelector("input")).toBeNull();
          // Location edits the same way: a check keeps the choice, an undo puts the earlier one back.
          container.querySelector<HTMLButtonElement>('button[aria-label="Edit Azure region"]')!.click();
          await expect.poll(() => container.querySelector('button[aria-label="Undo Azure region"]')).not.toBeNull();
          expect(container.querySelector('button[aria-label="Confirm Azure region"]')).not.toBeNull();
          container.querySelector<HTMLButtonElement>('button[aria-label="Undo Azure region"]')!.click();
          await expect.poll(() => container.querySelector("#core-infra-location")).toBeNull();

          create.click();
          await expect.poll(() => consentMock.mock.calls.length).toBe(2);
          // Running: the stage still waiting opens itself, and a short progress line sits above the resources.
          await expect.poll(() => stageButtons().length).toBe(4);
          await expect.poll(() => [...container.querySelectorAll('[role="status"]')].map((element) => element.textContent).join(" ")).toContain("of 6 tasks done");
          expect(stageButtons().map((stage) => stage.textContent?.replace(/\d+\/\d+.*/, ""))).toEqual(["Core infrastructure", "DNS & custom domain", "Frontend hosting", "Backend infrastructure"]);
          const running = stageButtons()[3];
          expect(running.getAttribute("aria-expanded")).toBe("true");
          expect(running.textContent).toContain("Running");

          release.current();
          await expect.poll(() => stageButtons()[3].textContent).toContain("Completed");
          // Links are the names themselves, never a separate icon.
          expect(resources.querySelector('[data-testid="OpenInNewIcon"]')).toBeNull();
          expect(resources.querySelectorAll("a").length).toBeGreaterThan(0);
          for (const link of resources.querySelectorAll("a")) expect(link.textContent).toMatch(/^\S.* \(opens in new tab\)$/);
          // The zone's name servers stay in the deployment details, not its status.
          expect(container.querySelector("#resource-row-dnsZone")!.textContent).toContain("Already exists");
          expect(container.querySelector("#resource-row-dnsZone")!.textContent).not.toContain("ns1.example");
          // Finished stages stay in the list and still open to show each step.
          const core = stageButtons()[0];
          expect(core.textContent).toContain("2/2");
          expect(core.getAttribute("aria-expanded")).toBe("false");
          core.click();
          await expect.poll(() => stageButtons()[0].getAttribute("aria-expanded")).toBe("true");
          expect(container.querySelector("#deployment-stage-core_infra")!.textContent).toContain("Shared with DNS & custom domain; runs once");
          const notices = container.querySelectorAll('[role="note"]');
          expect(notices).toHaveLength(1);
          expect(notices[0].textContent).toBe("If one or more steps fail, try running the process again.");
          expect(resources.compareDocumentPosition(notices[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
          expect(notices[0].compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
          expect(container.scrollWidth).toBeLessThanOrEqual(width);
        } finally {
          flushSync(() => root.unmount());
          container.remove();
          consentMock.mockClear();
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
