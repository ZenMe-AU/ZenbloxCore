/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button, ThemeProvider } from "@mui/material";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResourceGroupCreationAccess, type ResourceGroupCreationAccess as Access } from "../hooks/util/useResourceGroupCreationAccess";
import ResourceGroupCreationAccess from "../components/ResourceGroupCreationAccess";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import type { AzureAccount, AzureTarget } from "../types";
import theme from "../theme";

const check = vi.hoisted(() => vi.fn());
vi.mock("../api/azureArm", () => ({ ensureResourceGroupCreationAccess: check }));

const account = { tenantId: "tenant-1" } as AzureAccount;
const target = { azureAccount: account, subscriptionId: "sub-1", tenantId: "tenant-1" };
let latest: Access;
let root: Root;
let container: HTMLDivElement;

function Harness(props: AzureTarget) {
  const access = useResourceGroupCreationAccess(props);
  useEffect(() => {
    latest = access;
  }, [access]);
  return (
    <ThemeProvider theme={theme}>
      <ResourceGroupCreationAccess access={access} />
      <Button data-testid="create" disabled={access.status !== "ready"}>Create resources</Button>
    </ThemeProvider>
  );
}

beforeEach(() => {
  check.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

async function render(props: AzureTarget = target) {
  await act(async () => root.render(<Harness {...props} />));
}

describe("resource-group access before creation", () => {
  it("keeps creation disabled while checking, then enables it on success", async () => {
    let resolve!: () => void;
    check.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    await render();
    expect(latest.status).toBe("checking");
    expect(container.querySelector<HTMLButtonElement>('[data-testid="create"]')?.disabled).toBe(true);
    expect(container.textContent).toContain("Checking subscription Contributor access");
    await act(async () => resolve());
    expect(latest.status).toBe("ready");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Subscription access to create resource groups verified.");
    expect(container.querySelector<HTMLButtonElement>('[data-testid="create"]')?.disabled).toBe(false);
  });

  it("shows Contributor/PIM guidance before creation and offers a working recheck", async () => {
    check.mockRejectedValue(new Error(`You need Contributor access. Activate at ${AZURE_PIM_ACTIVATION_URL}`));
    await render();
    expect(latest.status).toBe("error");
    expect(container.textContent).toContain("You need Contributor access");
    const warning = container.querySelector('[role="alert"]');
    const icon = warning?.querySelector('[data-testid="WarningAmberIcon"]');
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.parentElement?.textContent).toBe("You may not have enough subscription access to create resource groups.");
    expect(warning?.classList.contains("MuiAlert-root")).toBe(false);
    expect(container.querySelector("a")?.href).toBe(AZURE_PIM_ACTIVATION_URL);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="create"]')?.disabled).toBe(true);
    check.mockResolvedValue(undefined);
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Recheck subscription access");
    expect(retry).toBeDefined();
    expect(retry?.classList.contains("MuiButton-contained")).toBe(true);
    await act(async () => retry!.click());
    expect(latest.status).toBe("ready");
    expect(check).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...target, subscriptionId: "sub-2" },
    { ...target, tenantId: "tenant-2" },
    { ...target, azureAccount: { tenantId: "tenant-1", username: "other" } as AzureAccount },
  ])("invalidates old access immediately for a different target: %j", async (next) => {
    check.mockResolvedValue(undefined);
    await render();
    expect(latest.status).toBe("ready");
    check.mockImplementation(() => new Promise(() => {}));
    await render(next);
    expect(latest.status).toBe("checking");
    expect(container.querySelector<HTMLButtonElement>('[data-testid="create"]')?.disabled).toBe(true);
    expect(check).toHaveBeenLastCalledWith(next.azureAccount, next.subscriptionId, next.tenantId);
  });

  it("ignores an old subscription's late response", async () => {
    let resolve!: () => void;
    check.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    await render();
    check.mockRejectedValue(new Error("New subscription requires Contributor"));
    await render({ ...target, subscriptionId: "sub-2" });
    await act(async () => resolve());
    expect(latest).toMatchObject({ status: "error", error: "New subscription requires Contributor" });
  });

  it("does not check until both account and subscription are selected", async () => {
    await render({ ...target, azureAccount: null });
    expect(latest.status).toBe("idle");
    await render({ ...target, subscriptionId: "" });
    expect(latest.status).toBe("idle");
    expect(check).not.toHaveBeenCalled();
  });

  it("does not treat an empty error message as granted access", async () => {
    check.mockRejectedValue(new Error(""));
    await render();
    expect(latest.status).toBe("error");
    expect(container.textContent).toContain("Could not verify subscription access");
  });
});
