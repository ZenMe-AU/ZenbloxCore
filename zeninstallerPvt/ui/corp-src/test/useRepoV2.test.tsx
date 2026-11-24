/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { createAppContext, SensitiveToken, type SharedCard } from "../appContext";
import RepoV2 from "../cards/RepoV2/RepoV2";
import { useRepoV2, type UseRepoV2 } from "../cards/RepoV2/useRepoV2";
import theme from "../theme";

const { api, createRepoApi } = vi.hoisted(() => {
  const api = {
    fetchOrgList: vi.fn(),
    fetchRepos: vi.fn(),
    checkTemplate: vi.fn(),
    fetchBranches: vi.fn(),
    fetchEnvs: vi.fn(),
    generateRepo: vi.fn(),
    createBranch: vi.fn(),
  };
  return { api, createRepoApi: vi.fn(() => api) };
});

vi.mock("../cards/RepoV2/api", () => ({ createRepoApi }));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  createRepoApi.mockReturnValue(api);
  api.fetchOrgList.mockResolvedValue([{ id: 1, login: "v2-user", type: "User" }]);
  api.fetchRepos.mockResolvedValue([{ id: 2, name: "test-repo" }]);
  api.checkTemplate.mockResolvedValue({ templateName: "ZenMe-AU/ZenbloxCore" });
  api.fetchBranches.mockResolvedValue([{ name: "PROD", commit: "abc", protected: false }]);
  api.fetchEnvs.mockResolvedValue([{ id: 3, name: "PROD", url: "https://example.test/env" }]);
});

function getPublishedRepo(store: ReturnType<typeof createAppContext>) {
  const entry = store.getSnapshot().cards.repo_v2;
  return entry?.initialised ? entry : undefined;
}

async function waitFor(assertion: () => void) {
  const deadline = Date.now() + 2000;
  for (; ;) {
    try { assertion(); return; } catch (error) {
      if (Date.now() > deadline) throw error;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
  }
}

it("renders the registered prerequisite through BaseCard while blocked", async () => {
  const store = createAppContext();
  store.update("github_login_v2", {
    title: "GitHub login 2",
    currentBaseCardStatus: "ready",
    currentStatus: "ready",
    githubAccount: null,
    githubToken: null,
    githubMode: null,
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <RepoV2 appCtxStore={store} />
        </ThemeProvider>
      </QueryClientProvider>
    ));
    await act(async () => container.querySelector<HTMLButtonElement>("#card-title-repo_v2 button")?.click());
    expect(container.querySelector<HTMLAnchorElement>('a[href="#card-github_login_v2"]')?.textContent).toContain("GitHub login 2");
  } finally {
    await act(async () => root.unmount());
  }
});

it("uses the V2 shared session, tracks its lifecycle, and clears selections on logout", async () => {
  const store = createAppContext();
  let latest: UseRepoV2 | undefined;
  function Harness() {
    const value = useRepoV2(store);
    useEffect(() => { latest = value; }, [value]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>));
    expect(Object.keys(latest ?? {})).toEqual(["baseCardContext", "privateContext"]);
    expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("blocked");
    expect(latest?.baseCardContext.prerequisiteIds).toEqual(["github_login_v2"]);
    expect(latest?.baseCardContext.unmetCardPrerequisites).toEqual(["github_login_v2"]);
    expect(latest?.baseCardContext.stateMachine?.currentState).toBe("blocked");
    const token = new SensitiveToken("v2-token");
    const login: SharedCard<"github_login_v2"> = {
      title: "GitHub login 2", currentBaseCardStatus: "complete", currentStatus: "signed-in",
      githubAccount: { login: "v2-user" }, githubToken: token, githubMode: "backend",
    };
    for (const incomplete of [
      { ...login, currentBaseCardStatus: "loading", currentStatus: "loading" },
      { ...login, currentBaseCardStatus: "action", currentStatus: "signing-in" },
      { ...login, currentBaseCardStatus: "ready", currentStatus: "ready" },
      { ...login, githubAccount: null },
      { ...login, githubToken: null },
      { ...login, githubMode: null },
    ] satisfies SharedCard<"github_login_v2">[]) {
      await act(async () => store.update("github_login_v2", incomplete));
      expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("blocked");
      expect(latest?.baseCardContext.unmetCardPrerequisites).toEqual(["github_login_v2"]);
      expect(createRepoApi).not.toHaveBeenCalled();
    }
    await act(async () => store.update("github_login_v2", {
      title: "GitHub login 2", currentBaseCardStatus: "complete", currentStatus: "signed-in",
      githubAccount: { login: "v2-user" }, githubToken: token, githubMode: "backend",
    }));
    await waitFor(() => {
      expect(latest?.privateContext.repo.repoList).toEqual([{ id: 2, name: "test-repo" }]);
      expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("ready");
    });
    expect(latest?.baseCardContext.unmetCardPrerequisites).toEqual([]);
    expect(latest?.baseCardContext.stateMachine?.currentState).toBe("ready");
    expect(createRepoApi).toHaveBeenCalledWith(token, "backend");
    await act(async () => latest?.privateContext.repo.setSelectedRepo({ id: 2, name: "test-repo" }));
    await waitFor(() => expect(latest?.privateContext.env.envList).toHaveLength(1));
    await act(async () => latest?.privateContext.env.setSelectedEnv({ id: 3, name: "PROD", url: "https://example.test/env" }));
    await waitFor(() => {
      expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("complete");
      expect(latest?.baseCardContext.lifecycle).toBe("complete");
      expect(getPublishedRepo(store)?.githubRepository).toEqual({
        account: { id: 1, login: "v2-user", type: "User" },
        repository: { id: 2, name: "test-repo" },
        environment: { id: 3, name: "PROD", url: "https://example.test/env" },
      });
    });
    let resolveCheck!: (value: { templateName: string }) => void;
    api.checkTemplate.mockReturnValueOnce(new Promise((resolve) => { resolveCheck = resolve; }));
    await act(async () => latest?.privateContext.repo.setSelectedRepo({ id: 9, name: "another-repo" }));
    expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("action");
    expect(getPublishedRepo(store)?.githubRepository).toBeNull();
    expect(latest?.privateContext.env.selectedEnv).toBeNull();
    await act(async () => store.update("github_login_v2", {
      title: "GitHub login 2", currentBaseCardStatus: "ready", currentStatus: "ready",
      githubAccount: null, githubToken: null, githubMode: null,
    }));
    expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("blocked");
    expect(latest?.privateContext.repo.selectedRepo).toBeNull();
    expect(latest?.privateContext.env.selectedEnv).toBeNull();
    expect(latest?.baseCardContext.lifecycle).toBe("blocked");
    expect(getPublishedRepo(store)?.githubRepository).toBeNull();
    await act(async () => resolveCheck({ templateName: "ZenMe-AU/ZenbloxCore" }));
    expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("blocked");
  } finally {
    await act(async () => root.unmount());
  }
});

it("restores the V2 repository chain from the initial URL params", async () => {
  api.fetchOrgList.mockResolvedValue([
    { id: 1, login: "other-user", type: "User" },
    { id: 2, login: "v2-user", type: "User" },
  ]);
  const store = createAppContext({ account: "v2-user", repo: "test-repo", env: "PROD" });
  let latest: UseRepoV2 | undefined;
  function Harness() {
    const value = useRepoV2(store);
    useEffect(() => { latest = value; }, [value]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>));
    await act(async () => store.update("github_login_v2", {
      title: "GitHub login 2", currentBaseCardStatus: "complete", currentStatus: "signed-in",
      githubAccount: { login: "v2-user" }, githubToken: new SensitiveToken("token"), githubMode: "direct",
    }));

    await waitFor(() => {
      expect(latest?.privateContext.repo.selectedAccount?.login).toBe("v2-user");
      expect(latest?.privateContext.repo.selectedRepo?.name).toBe("test-repo");
      expect(latest?.privateContext.env.selectedEnv?.name).toBe("PROD");
      expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("complete");
    });
    expect(store.getSnapshot().urlParams).toMatchObject({
      account: "v2-user",
      repo: "test-repo",
      env: "PROD",
    });
  } finally {
    await act(async () => root.unmount());
  }
});

it("ignores an old account request after switching GitHub sessions", async () => {
  let resolveOld!: (value: { id: number; login: string; type: "User" }[]) => void;
  api.fetchOrgList.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  const store = createAppContext();
  let latest: UseRepoV2 | undefined;
  function Harness() {
    const value = useRepoV2(store);
    useEffect(() => { latest = value; }, [value]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const publish = (login: string) => store.update("github_login_v2", {
    title: "GitHub login 2", currentBaseCardStatus: "complete", currentStatus: "signed-in",
    githubAccount: { login }, githubToken: new SensitiveToken(login), githubMode: "direct",
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  try {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>));
    await act(async () => publish("old-user"));
    expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("action");
    await act(async () => publish("new-user"));
    await waitFor(() => expect(latest?.privateContext.repo.selectedAccount?.login).toBe("v2-user"));
    await act(async () => resolveOld([{ id: 5, login: "old-user", type: "User" }]));
    expect(latest?.privateContext.repo.selectedAccount?.login).toBe("v2-user");
  } finally {
    await act(async () => root.unmount());
  }
});

it("reports an account loading failure and recovers on refresh", async () => {
  api.fetchOrgList.mockRejectedValueOnce(new Error("network error"));
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => { });
  const store = createAppContext();
  let latest: UseRepoV2 | undefined;
  function Harness() {
    const value = useRepoV2(store);
    useEffect(() => { latest = value; }, [value]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>));
    await act(async () => store.update("github_login_v2", {
      title: "GitHub login 2", currentBaseCardStatus: "complete", currentStatus: "signed-in", githubAccount: { login: "v2-user" },
      githubToken: new SensitiveToken("token"), githubMode: "direct",
    }));
    await waitFor(() => {
      expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("error");
      expect(latest?.baseCardContext.summary).toBe("Could not load GitHub accounts");
    });
    await act(async () => latest?.privateContext.repo.onRefresh());
    await waitFor(() => {
      expect(getPublishedRepo(store)?.currentBaseCardStatus).toBe("ready");
      expect(latest?.privateContext.repo.repoList).toHaveLength(1);
    });
  } finally {
    await act(async () => root.unmount());
    errorLog.mockRestore();
  }
});
