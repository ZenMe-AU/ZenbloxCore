/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppContext, type AppContext } from "../appContext";
import { checkPrerequisites } from "../components/useBaseCard";
import type { Lifecycle } from "../cards/AzureLoginV2/stateMachine";
import { useAzureLoginV2, type UseAzureLoginV2 } from "../cards/AzureLoginV2/useAzureLoginV2";
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
  const card: { latest?: UseAzureLoginV2; history: Lifecycle[]; root?: Root } = { history: [] };
  function Harness() {
    const value = useAzureLoginV2(store);
    card.latest = value;
    const lifecycle = value.baseCardContext.stateMachine!.currentState;
    if (card.history.at(-1) !== lifecycle) card.history.push(lifecycle);
    return null;
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  card.root = createRoot(document.createElement("div"));
  await act(async () => card.root!.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return card as typeof card & { latest: UseAzureLoginV2; root: Root };
}

const downstream = { cardId: "proto_card", title: "Downstream", lifecycle: "loading", prerequisiteIds: ["azure_login_v2"] } as const;

describe("useAzureLoginV2", () => {
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

    expect(Object.keys(card.latest)).toEqual(["baseCardContext", "privateContext"]);
    expect(Object.keys(card.latest.privateContext)).toEqual([
      "appContext", "signedInUsername", "loginError", "tenants", "tenantsLoaded", "tenantsRefreshing", "tenantsError",
      "tenantPinned", "manualTenantId", "tenantIdError", "login", "logout", "refresh", "setManualTenantId", "selectTenant",
    ]);
    expect(card.latest.privateContext.appContext.cards.azure_login_v2).toMatchObject({ initialised: true });
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("selecting-tenant");
    expect(card.latest.baseCardContext).toMatchObject({ cardId: "azure_login_v2", lifecycle: "action", summary: "Select a tenant" });
    expect(card.latest.privateContext).toMatchObject({ tenantsLoaded: true, tenantsRefreshing: false, tenantsError: null });
    expect(card.latest.baseCardContext).not.toHaveProperty("tenants");
    expect(msalMocks.listTenants).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().cards.azure_login_v2).toEqual({
      initialised: true, title: "Azure login 2", currentBaseCardStatus: "action", currentStatus: "selecting-tenant", azureTenantId: null,
      azureAccount: { homeAccountId: "home", environment: "login.microsoftonline.com", tenantId: "tenant-home", localAccountId: "local", username: "org@example.com" },
    });
    expect(checkPrerequisites(store.getSnapshot(), downstream)).toEqual(["azure_login_v2"]);

    const silent = deferred();
    msal.acquireTokenSilent.mockReturnValueOnce(silent.promise);
    await act(async () => card.latest.privateContext.selectTenant("tenant-1"));
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("confirming-tenant");
    expect(card.latest.baseCardContext.lifecycle).toBe("commit");
    await act(async () => silent.resolve());

    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("tenant-confirmed");
    expect(card.latest.baseCardContext.done).toBe(true);
    expect(card.latest.baseCardContext.summary).toBe("org@example.com · Tenant One");
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ authority: "https://login.microsoftonline.com/tenant-1" }));
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({ currentBaseCardStatus: "complete", currentStatus: "tenant-confirmed", azureTenantId: "tenant-1" });
    expect(checkPrerequisites(store.getSnapshot(), downstream)).toEqual([]);
    expect(JSON.stringify(store.getSnapshot())).not.toContain("secret-id-token");

    await act(async () => card.latest.privateContext.logout());
    expect(msal.clearCache).toHaveBeenCalled();
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("signed-out");
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({ currentBaseCardStatus: "ready", currentStatus: "signed-out", azureAccount: null, azureTenantId: null });
    expect(card.history).toEqual(["loading", "selecting-tenant", "confirming-tenant", "tenant-confirmed", "signed-out"]);
  });

  it("restores and confirms the tenant from the initial URL params", async () => {
    const msal = createMsal([homeAccount]);
    msalMocks.getMsal.mockResolvedValue(msal);
    const store = createAppContext({ tenant: "tenant-2" });
    const card = await renderCard(store);
    root = card.root;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("tenant-confirmed");
    expect(card.latest.privateContext.manualTenantId).toBe("tenant-2");
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({
      authority: "https://login.microsoftonline.com/tenant-2",
    }));
    expect(store.getSnapshot().urlParams.tenant).toBe("tenant-2");
  });

  it("redirects to Microsoft on login and shows a failed redirect as an error", async () => {
    const msal = createMsal([]);
    msalMocks.getMsal.mockResolvedValue(msal);
    const card = await renderCard(createAppContext());
    root = card.root;
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("signed-out");
    expect(card.latest.baseCardContext.summary).toBe("Sign in to Azure");

    const redirect = deferred();
    msal.loginRedirect.mockReturnValueOnce(redirect.promise);
    let login: Promise<void> | undefined;
    await act(async () => { login = card.latest.privateContext.login(); });
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("signing-in");
    expect(card.latest.baseCardContext.lifecycle).toBe("action");
    expect(msal.loginRedirect).toHaveBeenCalledWith({ scopes: ["login.scope"], authority: "https://login.microsoftonline.com/common", prompt: "select_account" });

    vi.spyOn(console, "error").mockImplementation(() => { });
    await act(async () => {
      redirect.reject(new Error("popup_window_error"));
      await login;
    });
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("error");
    expect(card.latest.baseCardContext).toMatchObject({ lifecycle: "error", summary: "popup_window_error" });

    await act(async () => card.latest.privateContext.login());
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("signing-in");
    expect(card.latest.privateContext.loginError).toBeNull();
  });

  it("shows a tenant failure, then keeps its consent redirect apart from the original card", async () => {
    const msal = createMsal([homeAccount]);
    msalMocks.getMsal.mockResolvedValue(msal);
    const card = await renderCard(createAppContext());
    root = card.root;

    msal.acquireTokenSilent.mockRejectedValueOnce(new Error("AADSTS90072: not a member"));
    await act(async () => card.latest.privateContext.selectTenant("tenant-2"));
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("error");
    expect(card.latest.privateContext.tenantIdError).toMatch(/isn't a member of that tenant/);

    msal.acquireTokenSilent.mockRejectedValueOnce(new Error("interaction_required"));
    await act(async () => card.latest.privateContext.selectTenant("tenant-2"));
    expect(msal.loginRedirect).toHaveBeenCalledWith({ scopes: ["arm.scope"], authority: "https://login.microsoftonline.com/tenant-2", prompt: "consent" });
    expect(sessionStorage.getItem(V2_TENANT_KEY)).toBe("tenant-2");
    expect(sessionStorage.getItem(V1_TENANT_KEY)).toBeNull();
    // Back to choosing while the page leaves for the consent prompt.
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("selecting-tenant");
  });

  it("pre-fills a personal account's first real tenant without confirming it", async () => {
    const msaAccount = { ...homeAccount, tenantId: "msa-tenant", tenantProfiles: new Map([["msa-tenant", {}], ["tenant-9", {}]]) } as AzureAccount;
    msalMocks.getMsal.mockResolvedValue(createMsal([msaAccount]));
    msalMocks.listTenants.mockRejectedValueOnce(new Error("MSA_NEEDS_TENANT"));
    const card = await renderCard(createAppContext());
    root = card.root;
    expect(card.latest.privateContext.manualTenantId).toBe("tenant-9");
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("selecting-tenant");
    expect(card.latest.privateContext.tenantsLoaded).toBe(true);
    expect(card.latest.privateContext.tenants).toEqual([{ tenantId: "tenant-9", displayName: "tenant-9" }]);
  });

  it("confirms the tenant it redirected for when the page comes back", async () => {
    sessionStorage.setItem(V2_TENANT_KEY, "tenant-2");
    const tenantAccount = { ...homeAccount, tenantId: "tenant-2", localAccountId: "local-2" } as AzureAccount;
    msalMocks.getMsal.mockResolvedValue(createMsal([homeAccount, tenantAccount]));
    const store = createAppContext();
    const card = await renderCard(store);
    root = card.root;

    expect(msalMocks.getToken).toHaveBeenCalledWith(tenantAccount, ["arm.scope"], "tenant-2");
    expect(card.latest.baseCardContext.stateMachine?.currentState).toBe("tenant-confirmed");
    expect(sessionStorage.getItem(V2_TENANT_KEY)).toBeNull();
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({
      currentBaseCardStatus: "complete", currentStatus: "tenant-confirmed", azureTenantId: "tenant-2", azureAccount: { tenantId: "tenant-2", localAccountId: "local-2" },
    });
  });

  it("hydrates one redirect result when StrictMode replays the mount effect", async () => {
    const msal = createMsal([]);
    msal.handleRedirectPromise.mockResolvedValue({ account: homeAccount } as never);
    msalMocks.getMsal.mockResolvedValue(msal);
    const store = createAppContext();
    let latest: UseAzureLoginV2 | undefined;
    function Harness() { latest = useAzureLoginV2(store); return null; }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(document.createElement("div"));

    await act(async () => root!.render(
      <QueryClientProvider client={queryClient}><StrictMode><Harness /></StrictMode></QueryClientProvider>
    ));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(latest?.privateContext.signedInUsername).toBe(homeAccount.username);
    expect(latest?.baseCardContext.stateMachine?.currentState).toBe("selecting-tenant");
    expect(msal.handleRedirectPromise).toHaveBeenCalledTimes(1);
    expect(msalMocks.listTenants).toHaveBeenCalledTimes(1);
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
    const shared = {
      title: "Azure login 2",
      currentBaseCardStatus: "complete" as const,
      currentStatus: "tenant-confirmed",
      azureAccount,
      azureTenantId: "tenant-1",
    };

    store.update("azure_login_v2", shared);
    const snapshot = store.getSnapshot();
    expect(events).toEqual(["added", "initialised"]);
    expect(snapshot.cards.azure_login_v2).not.toHaveProperty("azureAccount.idToken");
    expect(snapshot.cards.azure_login_v2).not.toHaveProperty("azureAccount.tenantProfiles");

    store.update("azure_login_v2", { ...shared, azureAccount: { ...azureAccount } });
    expect(store.getSnapshot()).toBe(snapshot);

    store.update("azure_login_v2", { ...shared, azureTenantId: "tenant-2" });
    store.update("azure_login_v2", { ...shared, azureAccount: { ...azureAccount, tenantId: "tenant-2" } });
    store.update("azure_login_v2", { ...shared, currentBaseCardStatus: "ready", currentStatus: "signed-out", azureAccount: null, azureTenantId: null });
    expect(events).toEqual(["added", "initialised", "updated", "updated", "updated"]);
    expect(store.getSnapshot().cards.azure_login_v2).toMatchObject({ azureAccount: null, azureTenantId: null });
  });
});
