/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { createAppContext } from "../appContext";
import {
  runAppRegistration,
  useAzureAppRegistrationV2,
  type RunAppRegistrationInput,
  type UseAzureAppRegistrationV2,
} from "../cards/AzureAppRegistrationV2/useAzureAppRegistrationCardV2";

const graph = vi.hoisted(() => ({
  createAppRegistration: vi.fn(),
  createServicePrincipal: vi.fn(),
  ensureFederatedCredential: vi.fn(),
  ensureRbacRole: vi.fn(),
  ensureServicePrincipalAccess: vi.fn(),
  getExistingApp: vi.fn(),
  getExistingSP: vi.fn(),
}));
vi.mock("../api/azureGraph", async (importOriginal) => ({ ...await importOriginal<object>(), ...graph }));
vi.mock("../auth/msal", async (importOriginal) => ({ ...await importOriginal<object>(), ensureScopeConsent: vi.fn(async () => false) }));
vi.mock("../hooks/util/useAzureCardAccess", async (importOriginal) => ({
  ...await importOriginal<object>(),
  useCardResourceAccess: () => ({ status: "ready", check: vi.fn(), reportFailure: vi.fn(), retry: vi.fn() }),
}));
vi.mock("../hooks/useGithubVariablesV2", () => ({ useGithubVariablesV2: () => ({ values: {}, loading: false }) }));

const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

it("keeps the card out of loading while the name is typed, and looks it up once typing pauses", async () => {
  graph.getExistingApp.mockResolvedValue(null);
  const warn = vi.spyOn(console, "warn");
  const store = createAppContext();
  const complete = { currentBaseCardStatus: "complete", currentStatus: "complete" } as const;
  store.update("azure_login_v2", { ...complete, title: "Azure login 2", azureTenantId: "tenant", azureAccount: { homeAccountId: "home", tenantId: "tenant" } as never });
  store.update("repo_v2", { ...complete, title: "Repo 2", githubRepository: { account: { login: "org", id: 1 }, repository: { id: 2, name: "repo" }, environment: { id: 3, name: "dev" } } as never });
  store.update("azure_subscription_v2", { ...complete, title: "Subscription 2", azureSubscription: { id: "sub", displayName: "Sub", tenantId: "tenant" } });
  store.update("github_login_v2", { ...complete, title: "GitHub login 2", githubAccount: null, githubMode: "direct", githubToken: { reveal: () => "token" } as never });
  let latest: UseAzureAppRegistrationV2 | undefined;
  const lifecycles: string[] = [];
  function Harness() {
    latest = useAzureAppRegistrationV2(store);
    lifecycles.push(latest.baseCardContext.lifecycle);
    return null;
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.createElement("div"));

  try {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>));
    await wait(10);
    expect(latest?.baseCardContext.lifecycle).toBe("ready");
    expect(graph.getExistingApp).toHaveBeenCalledTimes(1);

    lifecycles.length = 0;
    for (const name of ["a", "ab", "abc"]) await act(async () => latest!.privateContext.setAppName(name));
    await wait(600);

    expect(lifecycles).not.toContain("loading");
    expect(graph.getExistingApp).toHaveBeenCalledTimes(2);
    expect(graph.getExistingApp).toHaveBeenLastCalledWith(expect.anything(), "abc", "tenant", expect.anything());
    // Every move the derived lifecycle made here is one the state graph lists.
    expect(warn.mock.calls.filter(([message]) => String(message).includes("is not in stateGraph"))).toEqual([]);
  } finally {
    warn.mockRestore();
    await act(async () => root.unmount());
  }
});

function runInput(overrides: Partial<RunAppRegistrationInput> = {}): RunAppRegistrationInput {
  return {
    account: { homeAccountId: "home", tenantId: "tenant" } as RunAppRegistrationInput["account"],
    tenantId: "tenant",
    subscription: { id: "sub", displayName: "Sub", tenantId: "tenant" },
    githubRepository: {
      account: { login: "org", id: 1 },
      repository: { id: 2, name: "repo" },
      environment: { id: 3, name: "dev" },
    } as RunAppRegistrationInput["githubRepository"],
    githubRepoId: 2,
    appName: "zeninstaller-github",
    githubApi: { setOidcImmutableSubject: vi.fn(async () => undefined) } as unknown as RunAppRegistrationInput["githubApi"],
    discovery: { appName: "zeninstaller-github", application: { appId: "client-id", id: "object-id" }, servicePrincipal: { id: "sp-id" } },
    checkResourceAccess: vi.fn(async () => undefined) as unknown as RunAppRegistrationInput["checkResourceAccess"],
    reportAccessFailure: vi.fn(),
    updateStep: vi.fn(),
    signal: new AbortController().signal,
    ...overrides,
  };
}

it("runs every step, reusing the app and service principal discovery found", async () => {
  graph.ensureFederatedCredential.mockResolvedValueOnce(true);
  const input = runInput();

  await expect(runAppRegistration(input)).resolves.toBe("client-id");

  expect(graph.createAppRegistration).not.toHaveBeenCalled();
  expect(graph.createServicePrincipal).not.toHaveBeenCalled();
  expect(graph.ensureRbacRole).toHaveBeenCalledWith(input.account, "sub", "sp-id", "Reader", "tenant");
  expect(input.updateStep).toHaveBeenLastCalledWith("rbac", "done", "Sub");
});

it("marks the failed step, reports a 403 on the role and rethrows its message", async () => {
  graph.ensureRbacRole.mockRejectedValueOnce(new Error("403 Forbidden"));
  const input = runInput();

  await expect(runAppRegistration(input)).rejects.toThrow("403 Forbidden");

  expect(input.reportAccessFailure).toHaveBeenCalledOnce();
  expect(input.updateStep).toHaveBeenLastCalledWith("rbac", "error", "403 Forbidden");
});

it("rethrows an abort without marking a step failed", async () => {
  const controller = new AbortController();
  controller.abort();
  const input = runInput({ signal: controller.signal });

  await expect(runAppRegistration(input)).rejects.toThrow();

  expect(input.updateStep).not.toHaveBeenCalled();
});

it("uses the canonical two-context contract", async () => {
  const store = createAppContext();
  let latest: UseAzureAppRegistrationV2 | undefined;
  function Harness() { latest = useAzureAppRegistrationV2(store); return null; }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.createElement("div"));

  try {
    await act(async () => root.render(
      <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>,
    ));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(Object.keys(latest ?? {})).toEqual(["baseCardContext", "privateContext"]);
    expect(latest?.baseCardContext).toMatchObject({ cardId: "azure_app_registration_v2", lifecycle: "blocked" });
    expect(latest?.privateContext.appContext.cards.azure_app_registration_v2).toMatchObject({
      initialised: true,
      currentBaseCardStatus: "blocked",
      currentStatus: "blocked",
      azureClientId: null,
    });
  } finally {
    await act(async () => root.unmount());
  }
});
