/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { TextField, ThemeProvider } from "@mui/material";
import Caption from "../components/Caption";
import CardIntro from "../components/CardIntro";
import Card from "../components/Card";
import ConfigErrorNotice from "../components/ConfigErrorNotice";
import CopyRow from "../components/CopyRow";
import ErrorText from "../components/ErrorText";
import ExternalLink from "../components/ExternalLink";
import FieldLabel from "../components/FieldLabel";
import RestoreToast from "../components/RestoreToast";
import SecretsCard from "../components/SecretsCard";
import StatusText from "../components/StatusText";
import VariablesCard from "../components/VariablesCard";
import StepRow from "../cards/StepRow";
import { FailureLog } from "../cards/Stage/StageCard";
import StagePlanDetail from "../cards/Stage/StagePlanDetail";
import { getVariableDisplayName } from "../logic/variables";
import theme from "../theme";

describe("shared UI building blocks", () => {
  it("exposes variable and plan explanations on keyboard focus", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      flushSync(() => root.render(<ThemeProvider theme={theme} defaultMode="light">
        <VariablesCard requiredKeys={["CONTACT_EMAILS", "EDITED"]} descriptions={{ CONTACT_EMAILS: "Separate email addresses with commas" }}
          savedValues={{ CONTACT_EMAILS: "saved", EDITED: "old" }} localValues={{ CONTACT_EMAILS: "saved", EDITED: "new" }}
          deployedValues={{ CONTACT_EMAILS: "planned" }} overwriteWarning upsertStatuses={[]} onChange={() => {}} onRevert={() => {}} />
        <StagePlanDetail items={[]} summary={{ create: 0, update: 0, delete: 0, replace: 0 }} loading={false} error={null} behind planSha="123456789" latestSha="987654321" />
      </ThemeProvider>));
      const input = container.querySelector<HTMLInputElement>("#variable-CONTACT_EMAILS")!;
      expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Separate email addresses with commas");
      for (const [label, detail] of [
        ["CONTACT_EMAILS information", "Separate email addresses with commas"],
        ["CONTACT_EMAILS differs from the last plan", "Plan configured: planned"],
        ["EDITED overwrites a saved value", "Replaces saved value: old"],
        ["Plan is not latest", "Planned at 1234567"],
      ]) {
        const trigger = container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
        expect(trigger.tabIndex).toBe(0);
        expect(trigger.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
        expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
        await userEvent.tab();
        trigger.focus();
        await expect.poll(() => document.getElementById(trigger.getAttribute("aria-describedby") ?? "")?.textContent).toContain(detail);
        if (label.includes("last plan") || label.includes("overwrites")) {
          expect(document.getElementById(trigger.getAttribute("aria-describedby")!)?.querySelector('[data-sensitive="true"]')).not.toBeNull();
        }
        trigger.blur();
      }
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    it(`keeps expanded card status and unmet prerequisites visible at ${viewport.width}px`, async () => {
      await page.viewport(viewport.width, viewport.height);
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      const renderCard = (locked: boolean, requirementLabel = "Repository & environment") => flushSync(() => root.render(
        <ThemeProvider theme={theme} defaultMode="light">
          <Card cardId="github_signup" title="GitHub Sign Up" summary="Already signed in to GitHub"
            status="complete" locked={locked} requirements={locked ? [{ label: requirementLabel, target: "repo" }] : []}
            unavailable={false} expanded onToggle={() => {}} onRequirementClick={() => {}}>
            Content
          </Card>
        </ThemeProvider>
      ));
      try {
        renderCard(false);
        const status = container.querySelector<HTMLElement>('[title="Already signed in to GitHub"]')!;
        expect(status).not.toBeNull();
        const title = container.querySelector<HTMLElement>('[title="GitHub Sign Up"]')!;
        expect(status.parentElement).toBe(title.parentElement);
        expect(getComputedStyle(status.parentElement!).flexDirection).toBe("row");
        expect(status.getBoundingClientRect().width).toBeGreaterThan(0);
        expect(status.getBoundingClientRect().right).toBeLessThanOrEqual(viewport.width);
        expect(container.scrollWidth).toBeLessThanOrEqual(viewport.width);
        renderCard(true);
        expect(container.querySelector('[title="Repository & environment"]')).not.toBeNull();
        expect(container.querySelector('[title="Already signed in to GitHub"]')).toBeNull();
        renderCard(true, "Sign in to AWS");
        expect(container.querySelector('[title="Sign in to AWS"]')).not.toBeNull();
        expect(container.textContent).not.toContain("Prerequisites not met");
      } finally {
        flushSync(() => root.unmount());
        container.remove();
        await page.viewport(1280, 720);
      }
    });
  }

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    it(`resizes failure logs with pointer and keyboard input at ${viewport.width}px`, async () => {
      await page.viewport(viewport.width, viewport.height);
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      const text = Array.from({ length: 100 }, (_, index) => `Error ${index}: workflow output`).join("\n");

      try {
        flushSync(() => root.render(
          <ThemeProvider theme={theme} defaultMode="light">
            <FailureLog fetched text={text} />
            <FailureLog fetched text={text} />
          </ThemeProvider>
        ));
        const [handle, otherHandle] = container.querySelectorAll<HTMLElement>('[role="separator"]');
        const output = document.getElementById(handle.getAttribute("aria-controls")!)!;
        const panel = output.parentElement!;
        const initialHeight = panel.getBoundingClientRect().height;
        const minimum = Number(handle.getAttribute("aria-valuemin"));
        const maximum = Number(handle.getAttribute("aria-valuemax"));
        expect(initialHeight).toBe(minimum);
        expect(maximum).toBe(Math.floor(viewport.height * 0.8));
        expect(handle.getAttribute("aria-label")).toBe("Resize log output");
        expect(handle.getAttribute("aria-orientation")).toBe("horizontal");
        expect(output.contains(handle)).toBe(false);
        expect(output.tabIndex).toBe(0);
        expect(output.getAttribute("aria-label")).toBe("Failure log output");
        expect(container.querySelector('[aria-label="Expand log"]')).toBeNull();
        expect(getComputedStyle(output).overflowY).toBe("auto");
        expect(output.scrollHeight).toBeGreaterThan(output.clientHeight);
        expect(getComputedStyle(handle).touchAction).toBe("none");

        const handleRect = handle.getBoundingClientRect();
        const target = document.createElement("div");
        Object.assign(target.style, {
          position: "fixed", width: "16px", height: "16px",
          left: `${handleRect.x + handleRect.width / 2 - 8}px`,
          top: `${handleRect.y + handleRect.height / 2 + 80 - 8}px`,
        });
        container.appendChild(target);
        await userEvent.dragAndDrop(handle, target);
        expect(panel.getBoundingClientRect().height).toBeCloseTo(initialHeight + 80, 0);
        expect(Number(otherHandle.getAttribute("aria-valuenow"))).toBe(minimum);
        expect(document.activeElement).toBe(handle);
        target.remove();

        await userEvent.keyboard("{ArrowDown}");
        expect(panel.getBoundingClientRect().height).toBeCloseTo(initialHeight + 100, 0);
        await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
        expect(panel.getBoundingClientRect().height).toBeCloseTo(initialHeight + 40, 0);
        await userEvent.keyboard("{End}{ArrowDown}");
        expect(panel.getBoundingClientRect().height).toBe(maximum);
        expect(Number(handle.getAttribute("aria-valuenow"))).toBe(maximum);
        expect(handle.getAttribute("aria-valuetext")).toBe(`${maximum} pixels high`);
        expect(output.scrollHeight).toBeGreaterThan(output.clientHeight);
        output.scrollTop = output.scrollHeight;
        expect(output.scrollTop).toBeGreaterThan(0);
        expect(handle.getBoundingClientRect().bottom).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom);
        expect(panel.getBoundingClientRect().width).toBeLessThanOrEqual(viewport.width);

        await page.viewport(viewport.width, 600);
        await expect.poll(() => Number(handle.getAttribute("aria-valuenow"))).toBe(480);
        await userEvent.keyboard("{Home}{ArrowUp}");
        expect(panel.getBoundingClientRect().height).toBe(minimum);
        expect(document.activeElement).toBe(handle);
      } finally {
        flushSync(() => root.unmount());
        container.remove();
        await page.viewport(1280, 720);
      }
    });
  }

  it("stops resizing failure logs on touch cancellation, release, or lost capture", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      flushSync(() => root.render(<FailureLog fetched text={"Error\n".repeat(100)} />));
      const handle = container.querySelector<HTMLElement>('[role="separator"]')!;
      const initialHeight = Number(handle.getAttribute("aria-valuenow"));
      const capture = vi.spyOn(handle, "setPointerCapture").mockImplementation(() => {});
      vi.spyOn(handle, "hasPointerCapture").mockReturnValue(true);
      const release = vi.spyOn(handle, "releasePointerCapture").mockImplementation(() => {});
      const pointer = (type: string, clientY: number, pointerId = 1, isPrimary = true) => {
        flushSync(() => handle.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId, isPrimary, pointerType: "touch", button: 0, clientY,
        })));
      };

      pointer("pointerdown", 100, 2, false);
      pointer("pointermove", 180, 2, false);
      expect(capture).not.toHaveBeenCalled();
      expect(Number(handle.getAttribute("aria-valuenow"))).toBe(initialHeight);

      pointer("pointerdown", 100);
      expect(capture).toHaveBeenCalledWith(1);
      pointer("pointermove", 180);
      await expect.poll(() => Number(handle.getAttribute("aria-valuenow"))).toBe(initialHeight + 80);
      pointer("pointercancel", 180, 2, false);
      pointer("pointermove", 200);
      await expect.poll(() => Number(handle.getAttribute("aria-valuenow"))).toBe(initialHeight + 100);
      pointer("pointercancel", 200);
      pointer("pointermove", 260);
      expect(Number(handle.getAttribute("aria-valuenow"))).toBe(initialHeight + 100);

      pointer("pointerdown", 200);
      pointer("pointermove", -1000);
      await expect.poll(() => Number(handle.getAttribute("aria-valuenow"))).toBe(initialHeight);
      pointer("pointermove", 10000);
      const maximum = Number(handle.getAttribute("aria-valuemax"));
      await expect.poll(() => Number(handle.getAttribute("aria-valuenow"))).toBe(maximum);
      pointer("pointerup", 10000);
      expect(release).toHaveBeenCalledWith(1);
      pointer("pointermove", 200);
      expect(Number(handle.getAttribute("aria-valuenow"))).toBe(maximum);

      pointer("pointerdown", 200);
      pointer("lostpointercapture", 200);
      pointer("pointermove", 100);
      expect(Number(handle.getAttribute("aria-valuenow"))).toBe(maximum);
    } finally {
      vi.restoreAllMocks();
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  it("preserves failure log loading and empty states", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      flushSync(() => root.render(<FailureLog fetched={false} text={null} />));
      expect(container.textContent).toBe("Loading log...");
      expect(container.querySelector('[role="separator"]')).toBeNull();
      flushSync(() => root.render(<FailureLog fetched text={null} />));
      expect(container.textContent).toBe("");
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  it("defines distinct accessible palettes for day and night modes", () => {
    expect(theme.colorSchemes.light.palette.background.default).toBe("#f8fafc");
    expect(theme.colorSchemes.dark.palette.background.default).toBe("#080d0f");
    expect(theme.colorSchemes.light.palette.background.paper).toBe("#ffffff");
    expect(theme.colorSchemes.dark.palette.background.paper).toBe("#1b2629");
    expect(theme.colorSchemes.dark.palette.text.primary).toBe("#e7edef");
  });

  it("exposes setup-step states and names progress indicators", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <ThemeProvider theme={theme} defaultMode="light">
            <StepRow step={{ id: "pending", label: "Pending task", status: "pending" }} />
            <StepRow step={{ id: "running", label: "Running task", status: "running", progress: 0.4 }} />
            <StepRow step={{ id: "done", label: "Done task", status: "done" }} />
            <StepRow step={{ id: "skipped", label: "Skipped task", status: "skipped" }} />
            <StepRow step={{ id: "error", label: "Failed task", status: "error" }} />
          </ThemeProvider>
        );
      });

      const stepStates = [...container.querySelectorAll<HTMLElement>(".visually-hidden")]
        .map((element) => element.textContent)
        .filter((text) => text?.startsWith("Status:"));
      expect(stepStates).toEqual(["Status: Pending", "Status: Running", "Status: Done", "Status: Skipped", "Status: Error"]);
      expect(container.querySelector('[role="progressbar"][aria-label="Running: Running task"]')).not.toBeNull();
      expect(container.querySelector('[role="progressbar"][aria-label="Progress: Running task"]')).not.toBeNull();
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  it("associates the unavailable card controls with their configuration explanation", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <ThemeProvider theme={theme} defaultMode="light">
            <Card
              cardId="azure_login"
              title="Azure login"
              status="unavailable"
              locked={false}
              unavailable
              requirements={[]}
              expanded={false}
              onToggle={() => {}}
              onRequirementClick={() => {}}
              descriptionId="azure-login-config-error"
            >
              <ConfigErrorNotice id="azure-login-config-error" />
            </Card>
          </ThemeProvider>
        );
      });

      const notice = container.querySelector<HTMLElement>("#azure-login-config-error");
      expect(notice?.textContent).toContain("This card is unavailable because a required setting is missing or invalid.");
      expect(container.querySelectorAll('[aria-describedby="azure-login-config-error"]')).toHaveLength(2);
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  it("keeps semantics, link behavior, and editor field states consistent", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <ThemeProvider
            theme={theme}
            defaultMode="light"
              modeStorageKey="zeninstaller-test-mode"
              colorSchemeStorageKey="zeninstaller-test-color-scheme"
          >
            <CardIntro>Intro copy</CardIntro>
            <FieldLabel htmlFor="editor-base">Variable key</FieldLabel>
            <TextField id="editor-base" className="corpEditor" placeholder="not set" />
            <TextField id="editor-warning" className="corpEditor" data-editor-state="dirty" />
            <TextField id="editor-error" className="corpEditor" data-editor-state="error" error />
            <Caption>Supporting detail</Caption>
            <ErrorText>Request failed</ErrorText>
            <StatusText>Saved</StatusText>
            <VariablesCard
              requiredKeys={["DIRTY", "SUCCESS", "ERROR"]}
              savedValues={{ DIRTY: "saved", SUCCESS: "ok", ERROR: "bad" }}
              localValues={{ DIRTY: "edited", SUCCESS: "ok", ERROR: "bad" }}
              upsertStatuses={[{ key: "SUCCESS", status: "success" }]}
              keyErrors={{ ERROR: "Value is not valid" }}
              onChange={() => {}}
              onRevert={() => {}}
            />
            <SecretsCard
              requiredKeys={["API_TOKEN", "UPDATED_SECRET", "FAILED_SECRET"]}
              presentKeys={["API_TOKEN", "UPDATED_SECRET"]}
              secretsStatus={{ configured: true, valid: true }}
              pendingSecrets={[{ key: "API_TOKEN", value: "top-secret" }]}
              onSetPending={() => {}}
              onCancelPending={() => {}}
              upsertStatuses={[
                { key: "UPDATED_SECRET", status: "success" },
                { key: "FAILED_SECRET", status: "error", error: "Secret update failed" },
              ]}
            />
            <CopyRow label="Temporary credential" value="top-secret-value" masked />
            <RestoreToast loading warnings={[]} onDismiss={() => {}} />
            <RestoreToast loading={false} warnings={["Restore warning"]} onDismiss={() => {}} />
            <ExternalLink href="https://example.com/docs" label="Documentation">
              Read documentation
            </ExternalLink>
          </ThemeProvider>
        );
      });

      const baseInput = container.querySelector<HTMLInputElement>("#editor-base");
      expect(container.querySelector('label[for="editor-base"]')?.textContent).toBe("Variable key");
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

      expect(container.querySelector('label[for="variable-DIRTY"]')?.textContent).toBe(getVariableDisplayName("DIRTY"));
      expect(container.querySelector(`button[aria-label="Clear ${getVariableDisplayName("DIRTY")}"]`)).not.toBeNull();
      expect(container.querySelector(`button[aria-label="Revert ${getVariableDisplayName("DIRTY")} to saved value"]`)).not.toBeNull();
      const liveStatuses = [...container.querySelectorAll<HTMLElement>('[role="status"][aria-live="polite"]')];
      expect(liveStatuses.map((status) => status.textContent)).toContain("just updated");
      expect(container.querySelector('[role="alert"][aria-label="Value is not valid"]')).not.toBeNull();
      const politeStatusText = [...container.querySelectorAll<HTMLElement>('[role="status"][aria-live="polite"]')].map((status) => status.textContent);
      expect(politeStatusText).toContain("Restoring settings");
      expect(container.querySelector('button[aria-label="Dismiss restore warnings"]')).not.toBeNull();

      const revealButton = container.querySelector<HTMLButtonElement>('button[aria-label="Show pending value for API_TOKEN"]');
      expect(revealButton).not.toBeNull();
      const maskedValue = "•".repeat(Math.min("top-secret".length, 12));
      const pendingSecretValue = [...container.querySelectorAll<HTMLElement>('[data-sensitive="true"]')].find((value) => value.textContent === maskedValue);
      expect(pendingSecretValue?.textContent).toBe(maskedValue);
      expect(container.querySelector('button[aria-label="Discard pending change for API_TOKEN"]')).not.toBeNull();
      expect(container.querySelector('button[aria-label="Edit API_TOKEN"]')).not.toBeNull();
      expect(container.querySelector('[role="alert"][aria-label="Secret update failed"]')).not.toBeNull();

      flushSync(() => revealButton!.click());
      expect(revealButton?.getAttribute("aria-label")).toBe("Hide pending value for API_TOKEN");
      expect(pendingSecretValue?.textContent).toBe("top-secret");

      flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="Edit API_TOKEN"]')!.click());
      const secretInput = document.querySelector<HTMLInputElement>("#secret-value");
      expect(secretInput?.type).toBe("password");
      expect(document.querySelector('label[for="secret-value"]')?.textContent).toBe("Enter the secret value");
      expect(document.querySelector('[data-sensitive="true"] #secret-value')).not.toBeNull();
      expect(document.querySelector('button[aria-label="Close secret editor for API_TOKEN"]')).not.toBeNull();

      const maskedCopyText = "*".repeat("top-secret-value".length);
      const maskedCopyValue = [...container.querySelectorAll<HTMLElement>('[data-sensitive="true"]')].find((value) => value.textContent === maskedCopyText);
      const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="Copy Temporary credential"]');
      expect(maskedCopyValue?.textContent).toBe(maskedCopyText);
      expect(copyButton).not.toBeNull();

      const link = container.querySelector<HTMLAnchorElement>('a[href="https://example.com/docs"]');
      expect(link?.target).toBe("_blank");
      expect(link?.rel).toBe("noopener noreferrer");
      expect(link?.getAttribute("aria-label")).toBe("Documentation (opens in new tab)");
      expect(getComputedStyle(link!).fontSize).toBe("16px");
      expect(getComputedStyle(link!).textDecorationLine).toBe("none");
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  it("falls back when clipboard access is unavailable or denied and announces failure", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
    let legacyCopySucceeds = true;
    const execCommand = vi.fn(() => legacyCopySucceeds);

    try {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
      flushSync(() => root.render(<CopyRow label="Legacy value" value="sensitive-value" />));

      const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="Copy Legacy value"]')!;
      copyButton.focus();
      flushSync(() => copyButton.click());
      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(copyButton.getAttribute("aria-label")).toBe("Copied Legacy value");
      expect(document.activeElement).toBe(copyButton);

      legacyCopySucceeds = false;
      flushSync(() => copyButton.click());
      expect(copyButton.getAttribute("aria-label")).toBe("Copy failed Legacy value");
      expect(container.querySelector('[aria-live="assertive"]')?.textContent).toBe("Copy failed");

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard permission denied")) },
      });
      legacyCopySucceeds = true;
      flushSync(() => copyButton.click());
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(execCommand).toHaveBeenCalledTimes(3);
      expect(copyButton.getAttribute("aria-label")).toBe("Copied Legacy value");
    } finally {
      flushSync(() => root.unmount());
      container.remove();
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
      if (execCommandDescriptor) Object.defineProperty(document, "execCommand", execCommandDescriptor);
      else Reflect.deleteProperty(document, "execCommand");
    }
  });
});