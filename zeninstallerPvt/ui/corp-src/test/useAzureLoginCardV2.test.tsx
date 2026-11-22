/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppContext, type AppContext } from "../appContext";
import { checkPrerequisites } from "../components/useBaseCard";
import type { Lifecycle } from "../cards/AzureLoginV2/stateMachine";
import { useAzureLoginCardV2, type UseAzureLoginCardV2 } from "../cards/AzureLoginV2/useAzureLoginCardV2";
import type { AzureAccount } from "../types";

const { msalMocks } = vi.hoisted(() => ({
  msalMocks: { getMsal: vi.fn(), getToken: vi.fn(), listTenants: vi.fn() },
}));

vi.mock("../auth/msal", () => ({
  getMsal: msalMocks.getMsal,
  getToken: msalMocks.getToken,
  MSA_TENANT: "msa-tenant",
  LOGIN_AUTHORITY: "https://login.microsoftonline.com/common",
  PINNED_TENANT_ID: undefined,
  cleanTenantId: (tenant?: string | null) => tenant?.trim() || undefined,
}));

vi.mock("../api/azureGraph", () => ({ listTenants: msalMocks.listTenants }));

vi.mock("../config/azureConfig", () => ({
  AZURE_CLIENT_ID: "client-id",
  LOGIN_SCOPES: ["login.scope"],
  ARM_SCOPES: ["arm.scope"],
}));

const V2_TENANT_KEY = "zeninstaller_arm_tenant_v2";
const V1_TENANT_KEY = "zeninstaller_arm_tenant";

const homeAccount = {
  username: "org@example.com",
  homeAccountId: "home",
  environment: "login.microsoftonline.com",
  tenantId: "tenant-home",
  localAccountId: "local",
  idToken: "secret-id-token",
  tenantProfiles: new Map([["tenant-1", {}], ["tenant-2", {}]]),
} as AzureAccount;

function createMsal(accounts: AzureAccount[]) {
  return {
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
    getAllAccounts: vi.fn().mockReturnValue(accounts),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    acquireTokenSilent: vi.fn().mockResolvedValue(undefined),
    acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn().mockResolvedValue(undefined),
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

// Render the hook with its AppContext store so publication uses the production path.
async function renderCard(store: AppContext) {
  const card: { latest?: UseAzureLoginCardV2; history: Lifecycle[]; root?: Root } = { history: [] };
  function Harness() {
    const value = useAzureLoginCardV2(store);
    card.latest = value;
    if (card.history.at(-1) !== value.machineLifecycle) card.history.push(value.machineLifecycle);
    return null;
  }
  card.root = createRoot(document.createElement("div"));
  await act(async () => card.root!.render(<Harness />));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return card as typeof card & { latest: UseAzureLoginCardV2; root: Root };
}

const downstream = { cardId: "proto_card", title: "Downstream", lifecycle: "loading", prerequisiteIds: ["azure_login_v2"] } as const;

describe("useAzureLoginCardV2", () => {
  let root: Root | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    msalMocks.getToken.mockResolvedValue("arm-token");
    msalMocks.listTenants.mockResolvedValue([
      { tenantId: "tenant-1", displayName: "Tenant One" },
      { tenantId: "tenant-2", displayName: "Tenant Two" },
    ]);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
  });

  it("restores a session, confirms the picked tenant and shares it through AppContext", async () => {
    const msal = createMsal([homeAccount]);
    msalMocks.getMsal.mockResolvedValue(msal);
    const store = createAppContext();
    const card = await renderCard(store);
    root = card.root;

    expect(card.latest.machineLifecycle).toBe("selecting-tenant");
    expect(card.latest.baseCardContext).toMatchObject({ cardId: "azure_login_v2", lifecycle: "action", summary: "Select a tenant" });
    expect(store.getSnapshot().cards.azure_login_v2).toEqual({
      initialised: true, title: "Azure login 2", status: "action", azureTenantId: null,
      azureAccount: { homeAccountId: "home", environment: "login.microsoftonline.com", tenantId: "tenant-home", localAccountId: "local", username: "org@example.com" },
    });
    expect(checkPrerequisites(store.getSnapshot(), downstream)).toEqual(["azure_login_v2"]);

    const silent = deferred();
    msal.acquireTokenSilent.mockReturnValueOnce(silent.promise);
    await act(async () => card.latest.selectTenant("tenant-1"));
    expect(card.latest.machineLifecycle).toBe("confirming-tenant");
    expect(card.latest.baseCardContext.lifecycle).toBe("commit");
    await act(async () => silent.resolve());

    expect(card.latest.machineLifecycle).toBe("tenant-confirmed");
    expect(card.latest.done).toBe(true);
    expect(card.latest.summary).toBe("org@example.com · Tenant One");
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ authority: "https://login.microsoftonline.com/tenant-1" }));
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({ status: "complete", azureTenantId: "tenant-1" });
    expect(checkPrerequisites(store.getSnapshot(), downstream)).toEqual([]);
    expect(JSON.stringify(store.getSnapshot())).not.toContain("secret-id-token");

    await act(async () => card.latest.logout());
    expect(msal.clearCache).toHaveBeenCalled();
    expect(card.latest.machineLifecycle).toBe("signed-out");
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({ status: "ready", azureAccount: null, azureTenantId: null });
    expect(card.history).toEqual(["loading", "selecting-tenant", "confirming-tenant", "tenant-confirmed", "signed-out"]);
  });

  it("redirects to Microsoft on login and shows a failed redirect as an error", async () => {
    const msal = createMsal([]);
    msalMocks.getMsal.mockResolvedValue(msal);
    const card = await renderCard(createAppContext());
    root = card.root;
    expect(card.latest.machineLifecycle).toBe("signed-out");
    expect(card.latest.summary).toBe("Sign in to Azure");

    const redirect = deferred();
    msal.loginRedirect.mockReturnValueOnce(redirect.promise);
    let login: Promise<void> | undefined;
    await act(async () => { login = card.latest.login(); });
    expect(card.latest.machineLifecycle).toBe("signing-in");
    expect(card.latest.redirecting).toBe(true);
    expect(msal.loginRedirect).toHaveBeenCalledWith({ scopes: ["login.scope"], authority: "https://login.microsoftonline.com/common", prompt: "select_account" });

    vi.spyOn(console, "error").mockImplementation(() => { });
    await act(async () => {
      redirect.reject(new Error("popup_window_error"));
      await login;
    });
    expect(card.latest.machineLifecycle).toBe("error");
    expect(card.latest.baseCardContext).toMatchObject({ lifecycle: "error", summary: "popup_window_error" });

    await act(async () => card.latest.login());
    expect(card.latest.machineLifecycle).toBe("signing-in");
    expect(card.latest.loginError).toBeNull();
  });

  it("shows a tenant failure, then keeps its consent redirect apart from the original card", async () => {
    const msal = createMsal([homeAccount]);
    msalMocks.getMsal.mockResolvedValue(msal);
    const card = await renderCard(createAppContext());
    root = card.root;

    msal.acquireTokenSilent.mockRejectedValueOnce(new Error("AADSTS90072: not a member"));
    await act(async () => card.latest.selectTenant("tenant-2"));
    expect(card.latest.machineLifecycle).toBe("error");
    expect(card.latest.tenantIdError).toMatch(/isn't a member of that tenant/);

    msal.acquireTokenSilent.mockRejectedValueOnce(new Error("interaction_required"));
    await act(async () => card.latest.selectTenant("tenant-2"));
    expect(msal.loginRedirect).toHaveBeenCalledWith({ scopes: ["arm.scope"], authority: "https://login.microsoftonline.com/tenant-2", prompt: "consent" });
    expect(sessionStorage.getItem(V2_TENANT_KEY)).toBe("tenant-2");
    expect(sessionStorage.getItem(V1_TENANT_KEY)).toBeNull();
    // Back to choosing while the page leaves for the consent prompt.
    expect(card.latest.machineLifecycle).toBe("selecting-tenant");
  });

  it("pre-fills a personal account's first real tenant without confirming it", async () => {
    const msaAccount = { ...homeAccount, tenantId: "msa-tenant", tenantProfiles: new Map([["msa-tenant", {}], ["tenant-9", {}]]) } as AzureAccount;
    msalMocks.getMsal.mockResolvedValue(createMsal([msaAccount]));
    const card = await renderCard(createAppContext());
    root = card.root;
    expect(card.latest.manualTenantId).toBe("tenant-9");
    expect(card.latest.machineLifecycle).toBe("selecting-tenant");
    expect(card.latest.tenantsLoaded).toBe(true);
  });

  it("confirms the tenant it redirected for when the page comes back", async () => {
    sessionStorage.setItem(V2_TENANT_KEY, "tenant-2");
    const tenantAccount = { ...homeAccount, tenantId: "tenant-2", localAccountId: "local-2" } as AzureAccount;
    msalMocks.getMsal.mockResolvedValue(createMsal([homeAccount, tenantAccount]));
    const store = createAppContext();
    const card = await renderCard(store);
    root = card.root;

    expect(msalMocks.getToken).toHaveBeenCalledWith(tenantAccount, ["arm.scope"], "tenant-2");
    expect(card.latest.machineLifecycle).toBe("tenant-confirmed");
    expect(sessionStorage.getItem(V2_TENANT_KEY)).toBeNull();
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({
      status: "complete", azureTenantId: "tenant-2", azureAccount: { tenantId: "tenant-2", localAccountId: "local-2" },
    });
  });
});

describe("AppContext Azure fields", () => {
  it("stores the card-projected identity and publishes only real changes", () => {
    const store = createAppContext();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.type));
    const azureAccount = {
      homeAccountId: homeAccount.homeAccountId,
      environment: homeAccount.environment,
      tenantId: homeAccount.tenantId,
      localAccountId: homeAccount.localAccountId,
      username: homeAccount.username,
    };
    const shared = { title: "Azure login 2", status: "complete" as const, azureAccount, azureTenantId: "tenant-1" };

    store.update("azure_login_v2", shared);
    const snapshot = store.getSnapshot();
    expect(events).toEqual(["added", "initialised"]);
    expect(snapshot.cards.azure_login_v2).not.toHaveProperty("azureAccount.idToken");
    expect(snapshot.cards.azure_login_v2).not.toHaveProperty("azureAccount.tenantProfiles");

    store.update("azure_login_v2", { ...shared, azureAccount: { ...azureAccount } });
    expect(store.getSnapshot()).toBe(snapshot);

    store.update("azure_login_v2", { ...shared, azureTenantId: "tenant-2" });
    store.update("azure_login_v2", { ...shared, azureAccount: { ...azureAccount, tenantId: "tenant-2" } });
    store.update("azure_login_v2", { ...shared, status: "ready", azureAccount: null, azureTenantId: null });
    expect(events).toEqual(["added", "initialised", "updated", "updated", "updated"]);
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({ azureAccount: null, azureTenantId: null });
  });
});
