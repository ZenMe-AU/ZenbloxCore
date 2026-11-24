/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { createAppContext, SensitiveToken } from "../appContext";
import { useAzureSubscriptionV2, type UseAzureSubscriptionV2 } from "../cards/AzureSubscriptionV2/useAzureSubscriptionV2";

const { listSubscriptions, useGithubVariablesV2 } = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  useGithubVariablesV2: vi.fn(),
}));

vi.mock("../api/azureGraph", () => ({ listSubscriptions }));
vi.mock("../api/github", () => ({ createGithubApi: vi.fn(() => ({})) }));
vi.mock("../hooks/useGithubVariablesV2", () => ({ useGithubVariablesV2 }));

beforeEach(() => {
  vi.clearAllMocks();
  listSubscriptions.mockResolvedValue([{ id: "subscription-1", displayName: "Production", tenantId: "tenant-1" }]);
  useGithubVariablesV2.mockReturnValue({
    values: { AZURE_SUBSCRIPTION_ID: "subscription-1", AZURE_TENANT_ID: "tenant-1" },
    loading: false,
    refreshing: false,
    error: null,
    onRefresh: vi.fn(),
    onConfirmed: vi.fn(),
    api: {},
    target: null,
  });
});

it("uses the canonical two-context contract and publishes the saved subscription", async () => {
  const store = createAppContext();
  store.update("azure_login_v2", {
    title: "Azure login 2",
    currentBaseCardStatus: "complete",
    currentStatus: "tenant-confirmed",
    azureAccount: {
      homeAccountId: "home",
      environment: "login.microsoftonline.com",
      tenantId: "tenant-1",
      localAccountId: "local",
      username: "org@example.com",
    },
    azureTenantId: "tenant-1",
  });
  store.update("github_login_v2", {
    title: "GitHub login 2",
    currentBaseCardStatus: "complete",
    currentStatus: "signed-in",
    githubAccount: { login: "owner" },
    githubToken: new SensitiveToken("token"),
    githubMode: "direct",
  });
  store.update("repo_v2", {
    title: "Repository & environment 2",
    currentBaseCardStatus: "complete",
    currentStatus: "complete",
    githubRepository: {
      account: { id: 1, login: "owner", type: "User" },
      repository: { id: 2, name: "repo" },
      environment: { id: 3, name: "PROD", url: "https://example.test/env" },
    },
  });

  let latest: UseAzureSubscriptionV2 | undefined;
  function Harness() { latest = useAzureSubscriptionV2(store); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(Object.keys(latest ?? {})).toEqual(["baseCardContext", "privateContext"]);
    expect(latest?.baseCardContext).toMatchObject({ lifecycle: "complete", done: true });
    expect(latest?.baseCardContext).not.toHaveProperty("subscriptions");
    expect(latest?.baseCardContext).not.toHaveProperty("selectedSubscriptionId");
    expect(latest?.privateContext.subscriptions).toEqual([
      { id: "subscription-1", displayName: "Production", tenantId: "tenant-1" },
    ]);
    expect(latest?.privateContext).not.toHaveProperty("currentState");
    expect(latest?.privateContext.appContext.cards.azure_subscription_v2).toMatchObject({
      initialised: true,
      currentBaseCardStatus: "complete",
      currentStatus: "saved",
      azureSubscription: { id: "subscription-1", displayName: "Production", tenantId: "tenant-1" },
    });
  } finally {
    await act(async () => root.unmount());
  }
});

it("restores the V2 subscription from the initial URL params", async () => {
  listSubscriptions.mockResolvedValue([
    { id: "subscription-1", displayName: "Production", tenantId: "tenant-1" },
    { id: "subscription-2", displayName: "Testing", tenantId: "tenant-1" },
  ]);
  const store = createAppContext({ subscription: "Testing" });
  store.update("azure_login_v2", {
    title: "Azure login 2",
    currentBaseCardStatus: "complete",
    currentStatus: "tenant-confirmed",
    azureAccount: {
      homeAccountId: "home",
      environment: "login.microsoftonline.com",
      tenantId: "tenant-1",
      localAccountId: "local",
      username: "org@example.com",
    },
    azureTenantId: "tenant-1",
  });
  store.update("github_login_v2", {
    title: "GitHub login 2",
    currentBaseCardStatus: "complete",
    currentStatus: "signed-in",
    githubAccount: { login: "owner" },
    githubToken: new SensitiveToken("token"),
    githubMode: "direct",
  });
  store.update("repo_v2", {
    title: "Repository & environment 2",
    currentBaseCardStatus: "complete",
    currentStatus: "complete",
    githubRepository: {
      account: { id: 1, login: "owner", type: "User" },
      repository: { id: 2, name: "repo" },
      environment: { id: 3, name: "PROD", url: "https://example.test/env" },
    },
  });

  let latest: UseAzureSubscriptionV2 | undefined;
  function Harness() { latest = useAzureSubscriptionV2(store); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(latest?.privateContext.selectedSubscriptionId).toBe("subscription-2");
    expect(store.getSnapshot().urlParams.subscription).toBe("subscription-2");
  } finally {
    await act(async () => root.unmount());
  }
});

