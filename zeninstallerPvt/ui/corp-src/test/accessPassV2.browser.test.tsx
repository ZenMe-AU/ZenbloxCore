/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { getContrastRatio } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import AccessPassV2 from "../cards/AccessPassV2/AccessPassV2";
import { STORAGE_KEY } from "../cards/AccessPassV2/useAccessPassV2";
import { createAppContext, type AppContext } from "../appContext";
import theme from "../theme";

const mocks = vi.hoisted(() => ({
  listUsersManagedBySignedInUser: vi.fn(), ensureTemporaryAccessPassEnabled: vi.fn(), listUserAuthenticationMethods: vi.fn(),
  resetUserPassword: vi.fn(), deleteUserAuthenticationMethod: vi.fn(), createTemporaryAccessPassForUser: vi.fn(),
  temporaryAccessPassMethodExists: vi.fn(), getMsal: vi.fn(),
}));
vi.mock("../api/azureGraph", () => mocks);
vi.mock("../auth/msal", () => ({ getMsal: mocks.getMsal }));

const account = { homeAccountId: "home", environment: "login.microsoftonline.com", tenantId: "tenant-1", localAccountId: "local", username: "manager@example.com" };
function login(store: AppContext) {
  store.update("azure_login_v2", {
    title: "Azure login 2", currentBaseCardStatus: "complete", currentStatus: "tenant-confirmed", azureAccount: account, azureTenantId: "tenant-1",
  });
}

describe("AccessPassV2 UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem(STORAGE_KEY);
    mocks.listUsersManagedBySignedInUser.mockResolvedValue([{ id: "user-1", displayName: "Test User", userPrincipalName: "test@example.com" }]);
    mocks.ensureTemporaryAccessPassEnabled.mockResolvedValue(false);
    mocks.listUserAuthenticationMethods.mockResolvedValue([]);
    mocks.resetUserPassword.mockResolvedValue(undefined);
    mocks.createTemporaryAccessPassForUser.mockResolvedValue({ id: "tap-1", temporaryAccessPass: "test-pass-secret" });
    mocks.temporaryAccessPassMethodExists.mockResolvedValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    flushSync(() => root.unmount());
    queryClient.clear();
    container.remove();
    localStorage.removeItem(STORAGE_KEY);
  });
  async function render(store: AppContext, mode: "light" | "dark" = "dark") {
    const modeKey = `access-pass-v2-browser-${mode}`;
    localStorage.removeItem(modeKey);
    flushSync(() => root.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme} defaultMode={mode} modeStorageKey={modeKey}>
          <AccessPassV2 appCtxStore={store} />
        </ThemeProvider>
      </QueryClientProvider>
    ));
    await userEvent.click(page.getByRole("button", { name: /^Access pass 2/ }));
    await expect.poll(() => document.documentElement.getAttribute("data-mui-color-scheme")).toBe(mode);
  }

  it("keeps the intro and shared blocked UI, and force unlock never completes prerequisites", async () => {
    const store = createAppContext();
    store.update("azure_login_v2", {
      title: "Azure login 2", currentBaseCardStatus: "ready", currentStatus: "signed-out", azureAccount: null, azureTenantId: null,
    });
    await render(store);
    await expect.poll(() => container.textContent).toContain("Create a one-hour Temporary Access Pass");
    expect(container.querySelector('a[href="#card-azure_login_v2"]')?.textContent).toBe("Azure login 2 (azure_login_v2)");
    await userEvent.click(page.getByRole("button", { name: "click here to force unlock this card." }));
    await expect.poll(() => container.textContent).toContain("This card is force-unlocked");
    expect(store.getSnapshot().cards.access_pass_v2).toMatchObject({ currentBaseCardStatus: "blocked", currentStatus: "blocked" });
    expect(mocks.listUsersManagedBySignedInUser).not.toHaveBeenCalled();
    expect(mocks.resetUserPassword).not.toHaveBeenCalled();
    await userEvent.click(page.getByRole("button", { name: /This card is force-unlocked/ }));
    expect(container.textContent).toContain("The following prerequisites are incomplete");
    login(store);
    await expect.poll(() => container.querySelectorAll("tbody tr").length).toBe(1);
    expect(container.textContent).toContain("Test User");
    expect(store.getSnapshot().cards.access_pass_v2).toMatchObject({ currentBaseCardStatus: "ready" });
  });

  for (const mode of ["light", "dark"] as const) {
    it(`preserves creation, masking, delivery gates and subtle accessible colours in ${mode}`, async () => {
      const store = createAppContext();
      login(store);
      await render(store, mode);
      await expect.poll(() => container.querySelectorAll("tbody tr").length).toBe(1);
      await userEvent.click(page.getByRole("button", { name: "Create Access Pass", exact: true }));
      const createButton = () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Create Access Pass")!;
      expect(createButton().disabled).toBe(true);
      expect(mocks.resetUserPassword).not.toHaveBeenCalled();
      await userEvent.click(page.getByRole("checkbox", { name: "I verified the selected user's identity against their photo ID." }));
      expect(createButton().disabled).toBe(false);
      await userEvent.click(page.getByRole("button", { name: "Create Access Pass", exact: true }));
      await expect.poll(() => container.textContent).toContain("New Temporary Access Pass:");
      expect(container.textContent).not.toContain("test-pass-secret");
      expect(container.textContent).toContain("*".repeat("test-pass-secret".length));
      expect(store.getSnapshot().cards.access_pass_v2).toMatchObject({ currentBaseCardStatus: "complete" });
      expect(JSON.stringify(store.getSnapshot())).not.toContain("test-pass-secret");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const rgb = (colour: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = colour;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      const checkContrast = () => {
        const table = container.querySelector("table")!;
        const rows = Array.from(table.querySelectorAll("tbody tr"));
        const background = rgb(getComputedStyle(rows[0]).backgroundColor);
        const surface = rgb(getComputedStyle(table.parentElement!).backgroundColor);
        expect(getContrastRatio(background, surface)).toBeLessThan(1.3);
        for (const row of rows) expect(rgb(getComputedStyle(row).backgroundColor)).toBe(background);
        for (const element of table.querySelectorAll("tbody td, tbody .MuiTypography-root, tbody a")) {
          expect(getContrastRatio(rgb(getComputedStyle(element).color), background), element.textContent ?? "").toBeGreaterThanOrEqual(4.5);
        }
        return background;
      };
      const greenBackground = checkContrast();
      const markButton = () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Mark Complete")!;
      expect(markButton().disabled).toBe(true);
      await userEvent.click(page.getByRole("checkbox", { name: /Confirm that the person has signed in/ }));
      expect(markButton().disabled).toBe(false);
      await userEvent.click(page.getByRole("button", { name: "Mark Complete" }));
      expect(container.textContent).toContain("Completed");
      expect(checkContrast()).not.toBe(greenBackground);
      await userEvent.click(page.getByRole("button", { name: "Create Again", exact: true }));
      expect(container.querySelector<HTMLInputElement>("#access-pass-v2-photo-id-user-1")!.checked).toBe(false);
      expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Create Again")!.disabled).toBe(true);
    });
  }
});
