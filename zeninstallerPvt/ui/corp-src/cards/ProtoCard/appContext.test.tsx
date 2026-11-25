/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { stringify } from "yaml";
import { createAppContext, SensitiveToken } from "../../appContext";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";

it("keeps startup URL params available as cards register and publish", () => {
  const store = createAppContext({ repo: "example-repo", tenant: "tenant-123" });
  const initialUrlParams = store.getSnapshot().urlParams;

  expect(initialUrlParams).toEqual({ repo: "example-repo", tenant: "tenant-123" });
  store.update("proto_card", {
    title: "ProtoCard",
    currentBaseCardStatus: "loading",
    currentStatus: "loading",
  });
  expect(store.getSnapshot().urlParams).toBe(initialUrlParams);
});

it("merges URL updates, preserves unrelated params, and lets the last update win", () => {
  const originalUrl = window.location.href;
  window.history.replaceState({}, "", "/core?account=octocat&repo=old&tenant=t1#repo-card");
  const store = createAppContext({ account: "octocat", repo: "old", tenant: "t1" });
  const events: unknown[] = [];
  const unsubscribe = store.subscribe((event) => events.push(event));

  try {
    store.updateUrl({ repo: "new", env: "PROD" });
    store.updateUrl({ repo: "latest", env: null });

    expect(store.getSnapshot().urlParams).toEqual({ account: "octocat", repo: "latest", tenant: "t1" });
    expect(new URLSearchParams(window.location.search).get("repo")).toBe("latest");
    expect(new URLSearchParams(window.location.search).get("env")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("account")).toBe("octocat");
    expect(window.location.hash).toBe("#repo-card");
    expect(events).toEqual([
      { type: "url-updated", keys: ["repo", "env"] },
      { type: "url-updated", keys: ["repo", "env"] },
    ]);
  } finally {
    unsubscribe();
    window.history.replaceState({}, "", originalUrl);
  }
});

it("publishes added before initialised, and only publishes real changes", () => {
  const store = createAppContext();
  const events: unknown[] = [];
  const unsubscribe = store.subscribe((event) => {
    if (event.type === "url-updated") return;
    events.push({ event, entry: store.getSnapshot().cards[event.cardId] });
  });

  const initial = store.getSnapshot();
  const repoEntry = { title: "Repository & environment", currentBaseCardStatus: "loading" as const, currentStatus: "loading", githubRepository: null };
  store.update("repo_v2", repoEntry);
  expect(events).toEqual([
    { event: { type: "added", cardId: "repo_v2" }, entry: { initialised: false } },
    { event: { type: "initialised", cardId: "repo_v2" }, entry: { initialised: true, ...repoEntry } },
  ]);
  expect(initial.cards.repo_v2).toBeUndefined();
  const current = store.getSnapshot();
  store.update("repo_v2", repoEntry);
  expect(store.getSnapshot()).toBe(current);
  store.update("repo_v2", { ...repoEntry, currentBaseCardStatus: "complete", currentStatus: "complete" });
  expect(events.at(-1)).toEqual({
    event: { type: "updated", cardId: "repo_v2" },
    entry: { initialised: true, ...repoEntry, currentBaseCardStatus: "complete", currentStatus: "complete" },
  });
  unsubscribe();
  store.update("repo_v2", { ...repoEntry, title: "Renamed", currentBaseCardStatus: "complete", currentStatus: "complete" });
  expect(events).toHaveLength(3);
});

it("shares an explicitly sensitive token in memory without serializing its value", () => {
  const store = createAppContext();
  const token = new SensitiveToken("test-secret");
  store.update("github_login_v2", {
    title: "GitHub login 2", currentBaseCardStatus: "complete", currentStatus: "signed-in",
    githubAccount: { login: "first" }, githubToken: token, githubMode: "direct",
  });
  const entry = store.getSnapshot().cards.github_login_v2;
  expect(entry?.initialised && entry.githubToken?.reveal()).toBe("test-secret");
  expect(JSON.stringify(store.getSnapshot())).not.toContain("test-secret");
  expect(stringify(store.getSnapshot())).not.toContain("test-secret");
  const snapshot = store.getSnapshot();
  store.update("github_login_v2", {
    title: "GitHub login 2", currentBaseCardStatus: "complete", currentStatus: "signed-in",
    githubAccount: { login: "first" }, githubToken: token, githubMode: "direct",
  });
  expect(store.getSnapshot()).toBe(snapshot);
  store.update("github_login_v2", {
    title: "GitHub login 2", currentBaseCardStatus: "ready", currentStatus: "ready",
    githubAccount: null, githubToken: null, githubMode: null,
  });
  expect(store.getSnapshot().cards.github_login_v2).toMatchObject({ githubToken: null });
});

it("lets ProtoCard observe existing and later card data and status changes", async () => {
  const store = createAppContext();
  const root = createRoot(document.createElement("div"));
  let latest: UseProtoCard | undefined;
  function Harness() {
    latest = useProtoCard(store);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(Object.keys(latest ?? {})).toEqual(["baseCardContext", "privateContext"]);
    expect(latest?.privateContext.appContext.cards.repo_v2).toBeUndefined();
    expect(store.getSnapshot().cards.proto_card).toMatchObject({ initialised: true, title: "ProtoCard prototype card", currentBaseCardStatus: "loading", currentStatus: "loading" });
    await act(async () => store.update("repo_v2", { title: "Repository & environment", currentBaseCardStatus: "loading", currentStatus: "loading", githubRepository: null }));
    expect(latest?.privateContext.appContext.cards.repo_v2).toMatchObject({ initialised: true, title: "Repository & environment", currentBaseCardStatus: "loading" });
    await act(async () => store.update("repo_v2", { title: "Repository & environment", currentBaseCardStatus: "complete", currentStatus: "complete", githubRepository: null }));
    expect(latest?.privateContext.appContext.cards.repo_v2).toMatchObject({ initialised: true, title: "Repository & environment", currentBaseCardStatus: "complete" });
    const snapshot = store.getSnapshot();
    await act(async () => latest?.privateContext.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo_v2" }));
    expect(latest?.baseCardContext.prerequisiteIds[0]).toBe("repo_v2");
    expect(store.getSnapshot()).toBe(snapshot);
    await act(async () => root.unmount());

    const laterRoot = createRoot(document.createElement("div"));
    try {
      await act(async () => laterRoot.render(<Harness />));
      expect(latest?.privateContext.appContext.cards.repo_v2).toMatchObject({ initialised: true, title: "Repository & environment", currentBaseCardStatus: "complete" });
    } finally {
      await act(async () => laterRoot.unmount());
    }
  } finally {
    await act(async () => root.unmount());
  }
});

it("publishes typed GitHub snapshots and detects structural changes", async () => {
  const store = createAppContext();
  const root = createRoot(document.createElement("div"));
  let latest: UseProtoCard | undefined;
  function Harness() {
    latest = useProtoCard(store);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    const shared = {
      title: "GitHub login 2",
      currentBaseCardStatus: "complete" as const,
      currentStatus: "signed-in",
      githubAccount: { login: "first" },
      githubToken: new SensitiveToken("test-secret"),
      githubMode: "direct" as const,
    };
    await act(async () => store.update("github_login_v2", shared));
    expect(latest?.privateContext.appContext.cards.github_login_v2).toEqual({
      initialised: true,
      title: "GitHub login 2",
      currentBaseCardStatus: "complete",
      currentStatus: "signed-in",
      githubAccount: { login: "first" },
      githubToken: shared.githubToken,
      githubMode: "direct",
    });
    expect(JSON.stringify(store.getSnapshot())).not.toContain("test-secret");

    const snapshot = store.getSnapshot();
    await act(async () => store.update("github_login_v2", { ...shared, githubAccount: { login: "first" } }));
    expect(store.getSnapshot()).toBe(snapshot);
    await act(async () => store.update("github_login_v2", { ...shared, githubAccount: { login: "second" } }));
    expect(latest?.privateContext.appContext.cards.github_login_v2).toMatchObject({ githubAccount: { login: "second" } });
    await act(async () => store.update("github_login_v2", { ...shared, githubAccount: null }));
    expect(latest?.privateContext.appContext.cards.github_login_v2).toMatchObject({ githubAccount: null });
  } finally {
    await act(async () => root.unmount());
  }
});

it("publishes changed repository results and clears them", () => {
  const store = createAppContext();
  const githubRepository = {
    account: { id: 1, login: "owner", type: "User" as const, htmlUrl: "https://github.com/owner" },
    repository: { id: 2, name: "repo", htmlUrl: "https://github.com/owner/repo" },
    environment: { id: 3, name: "PROD", settingsUrl: "https://github.com/owner/repo/settings/environments/3/edit" },
  };
  store.update("repo_v2", { title: "Repo 2", currentBaseCardStatus: "complete", currentStatus: "complete", githubRepository });
  const snapshot = store.getSnapshot();
  expect(snapshot.cards.repo_v2).toMatchObject({ githubRepository });
  store.update("repo_v2", { title: "Repo 2", currentBaseCardStatus: "complete", currentStatus: "complete", githubRepository: { ...githubRepository } });
  expect(store.getSnapshot()).toBe(snapshot);
  store.update("repo_v2", {
    title: "Repo 2", currentBaseCardStatus: "complete", currentStatus: "complete", githubRepository: {
      ...githubRepository, environment: { ...githubRepository.environment, name: "TEST" },
    }
  });
  expect(store.getSnapshot().cards.repo_v2).toMatchObject({ githubRepository: { environment: { name: "TEST" } } });
  store.update("repo_v2", { title: "Repo 2", currentBaseCardStatus: "ready", currentStatus: "ready", githubRepository: null });
  expect(store.getSnapshot().cards.repo_v2).toMatchObject({ githubRepository: null });
});
