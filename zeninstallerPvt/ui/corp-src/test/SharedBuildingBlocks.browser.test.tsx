/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { TextField, ThemeProvider } from "@mui/material";
import Caption from "../components/Caption";
import CardIntro from "../components/CardIntro";
import CopyRow from "../components/CopyRow";
import ErrorText from "../components/ErrorText";
import ExternalLink from "../components/ExternalLink";
import FieldLabel from "../components/FieldLabel";
import RestoreToast from "../components/RestoreToast";
import SecretsCard from "../components/SecretsCard";
import StatusText from "../components/StatusText";
import VariablesCard from "../components/VariablesCard";
import { getVariableDisplayName } from "../logic/variables";
import theme from "../theme";

describe("shared UI building blocks", () => {
  it("defines distinct accessible palettes for day and night modes", () => {
    expect(theme.colorSchemes.light.palette.background.default).toBe("#f8fafc");
    expect(theme.colorSchemes.dark.palette.background.default).toBe("#080d0f");
    expect(theme.colorSchemes.light.palette.background.paper).toBe("#ffffff");
    expect(theme.colorSchemes.dark.palette.background.paper).toBe("#1b2629");
    expect(theme.colorSchemes.dark.palette.text.primary).toBe("#e7edef");
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