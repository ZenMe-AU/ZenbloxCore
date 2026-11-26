/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppContext, type AppContext } from "../appContext";
import { STORAGE_KEY, useAccessPassV2, type UseAccessPassV2 } from "../cards/AccessPassV2/useAccessPassV2";

const mocks = vi.hoisted(() => ({
  listUsersManagedBySignedInUser: vi.fn(), ensureTemporaryAccessPassEnabled: vi.fn(), listUserAuthenticationMethods: vi.fn(),
  resetUserPassword: vi.fn(), deleteUserAuthenticationMethod: vi.fn(), createTemporaryAccessPassForUser: vi.fn(),
  temporaryAccessPassMethodExists: vi.fn(), getMsal: vi.fn(), generateRandomPassword: vi.fn(),
}));
vi.mock("../api/azureGraph", () => mocks);
vi.mock("../auth/msal", () => ({ getMsal: mocks.getMsal }));
vi.mock("../logic/password", () => ({ generateRandomPassword: mocks.generateRandomPassword }));

const account = { homeAccountId: "home", environment: "login.microsoftonline.com", tenantId: "tenant-1", localAccountId: "local", username: "manager@example.com" };
const pass = { accessPassValue: "test-pass", tenantId: "tenant-1", targetUserId: "user-1", tapMethodId: "tap-1" };
function login(store: AppContext, tenantId = "tenant-1") {
  store.update("azure_login_v2", { title: "Azure login 2", currentBaseCardStatus: "complete", currentStatus: "tenant-confirmed", azureAccount: account, azureTenantId: tenantId });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function waitFor(assertion: () => void) {
  const start = Date.now();
  for (;;) {
    try { assertion(); return; } catch (error) {
      if (Date.now() - start > 3000) throw error;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
  }
}

describe("useAccessPassV2", () => {
  let root: Root;
  let queryClient: QueryClient;
  let latest: UseAccessPassV2;
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listUsersManagedBySignedInUser.mockResolvedValue([{ id: "user-1", displayName: "Test User", userPrincipalName: "test@example.com" }]);
    mocks.ensureTemporaryAccessPassEnabled.mockResolvedValue(false);
    mocks.listUserAuthenticationMethods.mockResolvedValue([]);
    mocks.resetUserPassword.mockResolvedValue(undefined);
    mocks.deleteUserAuthenticationMethod.mockResolvedValue(undefined);
    mocks.createTemporaryAccessPassForUser.mockResolvedValue({ id: "tap-1", temporaryAccessPass: "test-pass" });
    mocks.temporaryAccessPassMethodExists.mockResolvedValue(true);
    mocks.generateRandomPassword.mockReturnValue("random-password");
    mocks.getMsal.mockResolvedValue({ acquireTokenRedirect: vi.fn().mockResolvedValue(undefined) });
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    queryClient?.clear();
    vi.restoreAllMocks();
  });
  async function render(store: AppContext) {
    function Harness() { latest = useAccessPassV2(store); return null; }
    root = createRoot(document.createElement("div"));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>));
  }
  async function confirm() {
    await act(async () => latest.privateContext.confirmUser("user-1"));
    await act(async () => latest.privateContext.dispatch({ type: "photo-id", confirmed: true }));
  }
  function savePass() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      identityKey: JSON.stringify([account.homeAccountId, account.environment, "tenant-1"]),
      passes: { "user-1": pass }, deliveryConfirmed: {}, completed: {},
    }));
  }

  it("returns only the two contexts and responds to live Azure login publication", async () => {
    const store = createAppContext();
    await render(store);
    expect(Object.keys(latest)).toEqual(["baseCardContext", "privateContext"]);
    expect(latest.baseCardContext.lifecycle).toBe("blocked");
    expect(mocks.listUsersManagedBySignedInUser).not.toHaveBeenCalled();
    await act(async () => login(store));
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe("ready"));
    expect(latest.privateContext.managerUsers).toHaveLength(1);
    expect(store.getSnapshot().cards.access_pass_v2).toEqual({
      initialised: true, title: "Access pass 2", currentBaseCardStatus: "ready", currentStatus: "ready",
    });
  });

  it("gates creation on photo ID, runs the ordered workflow and persists only V2 state", async () => {
    const store = createAppContext();
    login(store);
    await render(store);
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe("ready"));
    await act(async () => latest.privateContext.createPass());
    expect(mocks.ensureTemporaryAccessPassEnabled).not.toHaveBeenCalled();
    await confirm();
    mocks.listUserAuthenticationMethods.mockResolvedValueOnce([
      { id: "password", "@odata.type": "#microsoft.graph.passwordAuthenticationMethod" },
      { id: "phone", "@odata.type": "#microsoft.graph.phoneAuthenticationMethod" },
    ]);
    await act(async () => latest.privateContext.createPass());
    expect(latest.baseCardContext).toMatchObject({ lifecycle: "complete", done: true });
    expect(latest.privateContext.passes["user-1"]).toEqual(pass);
    expect(mocks.deleteUserAuthenticationMethod).toHaveBeenCalledExactlyOnceWith(account, "/users/user-1/authentication/phoneMethods/phone", "tenant-1");
    expect(mocks.resetUserPassword).toHaveBeenCalledWith(account, "user-1", "random-password", "tenant-1");
    expect(mocks.generateRandomPassword).toHaveBeenCalledWith(30);
    expect(mocks.deleteUserAuthenticationMethod.mock.invocationCallOrder[0]).toBeLessThan(mocks.resetUserPassword.mock.invocationCallOrder[0]);
    expect(mocks.resetUserPassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.createTemporaryAccessPassForUser.mock.invocationCallOrder[0]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).passes["user-1"]).toEqual(pass);
    expect(localStorage.getItem("zeninstaller_corp_access_pass_result")).toBeNull();
    expect(JSON.stringify(store.getSnapshot())).not.toContain("test-pass");
    expect(Object.keys(store.getSnapshot().cards.access_pass_v2!)).toEqual(["initialised", "title", "currentBaseCardStatus", "currentStatus"]);
  });

  it("reports the real password-reset 403 and never creates a pass after failure", async () => {
    const store = createAppContext();
    login(store);
    await render(store);
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe("ready"));
    await confirm();
    mocks.resetUserPassword.mockRejectedValueOnce(new Error('403 /users/user-1: {"error":{"code":"Authorization_RequestDenied"}}'));
    await act(async () => latest.privateContext.createPass());
    expect(latest.baseCardContext).toMatchObject({ lifecycle: "error", done: false });
    expect(latest.privateContext.error).toContain("User-PasswordProfile.ReadWrite.All");
    expect(latest.privateContext.steps.find((step) => step.id === "rotatePassword")?.status).toBe("error");
    expect(mocks.createTemporaryAccessPassForUser).not.toHaveBeenCalled();
  });

  it("requests tenant-scoped incremental consent including the password-profile scope", async () => {
    const store = createAppContext();
    login(store);
    await render(store);
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe("ready"));
    await act(async () => latest.privateContext.requestAccessPassConsent());
    const msal = await mocks.getMsal();
    expect(msal.acquireTokenRedirect).toHaveBeenCalledWith({
      scopes: expect.arrayContaining(["https://graph.microsoft.com/User-PasswordProfile.ReadWrite.All"]),
      account, authority: "https://login.microsoftonline.com/tenant-1",
    });
  });

  it("discards late managed-user responses after the tenant changes", async () => {
    const first = deferred<Array<{ id: string; displayName: string }>>();
    mocks.listUsersManagedBySignedInUser.mockReturnValueOnce(first.promise);
    const store = createAppContext();
    login(store);
    await render(store);
    await act(async () => login(store, "tenant-2"));
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe("ready"));
    await act(async () => first.resolve([{ id: "old-user", displayName: "Old tenant" }]));
    expect(latest.privateContext.managerUsers.map((user) => user.id)).toEqual(["user-1"]);
    expect(latest.privateContext.passes).toEqual({});
  });

  it("stops destructive operations after a mid-run tenant change and prevents concurrent starts", async () => {
    const policy = deferred<boolean>();
    mocks.ensureTemporaryAccessPassEnabled.mockReturnValueOnce(policy.promise);
    const store = createAppContext();
    login(store);
    await render(store);
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe("ready"));
    await confirm();
    let running!: Promise<void>;
    await act(async () => { running = latest.privateContext.createPass(); });
    await act(async () => latest.privateContext.createPass());
    expect(mocks.ensureTemporaryAccessPassEnabled).toHaveBeenCalledTimes(1);
    await act(async () => login(store, "tenant-2"));
    await act(async () => { policy.resolve(false); await running; });
    expect(mocks.listUserAuthenticationMethods).not.toHaveBeenCalled();
    expect(mocks.resetUserPassword).not.toHaveBeenCalled();
    expect(mocks.createTemporaryAccessPassForUser).not.toHaveBeenCalled();
    expect(latest.privateContext.passes).toEqual({});
    expect(console.error).toHaveBeenCalledWith("accessPassV2WorkflowStepFailed", expect.objectContaining({ message: expect.stringContaining("session changed") }));
  });

  it.each([true, false])("validates restored passes before trusting completion (exists=%s)", async (exists) => {
    savePass();
    const validation = deferred<boolean>();
    mocks.temporaryAccessPassMethodExists.mockReturnValueOnce(validation.promise);
    const store = createAppContext();
    login(store);
    await render(store);
    expect(latest.baseCardContext.lifecycle).toBe("loading");
    expect(latest.privateContext.validationPending).toBe(true);
    await act(async () => validation.resolve(exists));
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe(exists ? "complete" : "ready"));
    expect(latest.privateContext.passes).toEqual(exists ? { "user-1": pass } : {});
    expect(mocks.resetUserPassword).not.toHaveBeenCalled();
  });

  it("surfaces restored-pass validation failures instead of showing an unverified pass", async () => {
    savePass();
    mocks.temporaryAccessPassMethodExists.mockRejectedValueOnce(new Error("403 temporaryAccessPassMethods denied"));
    const store = createAppContext();
    login(store);
    await render(store);
    await waitFor(() => expect(latest.baseCardContext.lifecycle).toBe("error"));
    expect(latest.privateContext.passes).toEqual({});
    expect(latest.privateContext.error).toContain("Couldn't validate saved access passes");
  });
});
