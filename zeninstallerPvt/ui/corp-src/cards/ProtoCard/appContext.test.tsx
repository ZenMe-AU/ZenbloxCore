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

it("publishes added before initialised, and only publishes real changes", () => {
  const store = createAppContext();
  const events: unknown[] = [];
  const unsubscribe = store.subscribe((event) => {
    events.push({ event, entry: store.getSnapshot().cards[event.cardId] });
  });

  const initial = store.getSnapshot();
  store.update("repo", { title: "Repository & environment", status: "loading" });
  expect(events).toEqual([
    { event: { type: "added", cardId: "repo" }, entry: { initialised: false } },
    { event: { type: "initialised", cardId: "repo" }, entry: { initialised: true, title: "Repository & environment", status: "loading" } },
  ]);
  expect(initial.cards.repo).toBeUndefined();
  const current = store.getSnapshot();
  store.update("repo", { title: "Repository & environment", status: "loading" });
  expect(store.getSnapshot()).toBe(current);
  store.update("repo", { title: "Repository & environment", status: "complete" });
  expect(events.at(-1)).toEqual({
    event: { type: "updated", cardId: "repo" },
    entry: { initialised: true, title: "Repository & environment", status: "complete" },
  });
  unsubscribe();
  store.update("repo", { title: "Renamed", status: "complete" });
  expect(events).toHaveLength(3);
});

it("shares an explicitly sensitive token in memory without serializing its value", () => {
  const store = createAppContext();
  const token = new SensitiveToken("test-secret");
  store.update("github_login_v2", {
    title: "GitHub login 2", status: "complete", githubAccount: { login: "first" }, githubToken: token, githubMode: "direct",
  });
  const entry = store.getSnapshot().cards.github_login_v2;
  expect(entry?.initialised && entry.githubToken?.reveal()).toBe("test-secret");
  expect(JSON.stringify(store.getSnapshot())).not.toContain("test-secret");
  expect(stringify(store.getSnapshot())).not.toContain("test-secret");
  const snapshot = store.getSnapshot();
  store.update("github_login_v2", {
    title: "GitHub login 2", status: "complete", githubAccount: { login: "first" }, githubToken: token, githubMode: "direct",
  });
  expect(store.getSnapshot()).toBe(snapshot);
  store.update("github_login_v2", {
    title: "GitHub login 2", status: "ready", githubAccount: null, githubToken: null, githubMode: null,
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
    expect(latest?.privateContext.appContext.cards.repo).toBeUndefined();
    expect(store.getSnapshot().cards.proto_card).toMatchObject({ initialised: true, title: "ProtoCard prototype card", status: "loading" });
    await act(async () => store.update("repo", { title: "Repository & environment", status: "loading" }));
    expect(latest?.privateContext.appContext.cards.repo).toEqual({ initialised: true, title: "Repository & environment", status: "loading" });
    await act(async () => store.update("repo", { title: "Repository & environment", status: "complete" }));
    expect(latest?.privateContext.appContext.cards.repo).toEqual({ initialised: true, title: "Repository & environment", status: "complete" });
    const snapshot = store.getSnapshot();
    await act(async () => latest?.privateContext.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo" }));
    expect(latest?.baseCardContext.prerequisiteIds[0]).toBe("repo");
    expect(store.getSnapshot()).toBe(snapshot);
    await act(async () => root.unmount());

    const laterRoot = createRoot(document.createElement("div"));
    try {
      await act(async () => laterRoot.render(<Harness />));
      expect(latest?.privateContext.appContext.cards.repo).toEqual({ initialised: true, title: "Repository & environment", status: "complete" });
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
      status: "complete" as const,
      githubAccount: { login: "first" },
      githubToken: new SensitiveToken("test-secret"),
      githubMode: "direct" as const,
    };
    await act(async () => store.update("github_login_v2", shared));
    expect(latest?.privateContext.appContext.cards.github_login_v2).toEqual({
      initialised: true,
      title: "GitHub login 2",
      status: "complete",
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
    account: { id: 1, login: "owner", type: "User" as const },
    repository: { id: 2, name: "repo" },
    environment: { id: 3, name: "PROD", url: "https://example.test/env" },
  };
  store.update("repo_v2", { title: "Repo 2", status: "complete", githubRepository });
  const snapshot = store.getSnapshot();
  expect(snapshot.cards.repo_v2).toMatchObject({ githubRepository });
  store.update("repo_v2", { title: "Repo 2", status: "complete", githubRepository: { ...githubRepository } });
  expect(store.getSnapshot()).toBe(snapshot);
  store.update("repo_v2", {
    title: "Repo 2", status: "complete", githubRepository: {
      ...githubRepository, environment: { ...githubRepository.environment, name: "TEST" },
    }
  });
  expect(store.getSnapshot().cards.repo_v2).toMatchObject({ githubRepository: { environment: { name: "TEST" } } });
  store.update("repo_v2", { title: "Repo 2", status: "ready", githubRepository: null });
  expect(store.getSnapshot().cards.repo_v2).toMatchObject({ githubRepository: null });
});
