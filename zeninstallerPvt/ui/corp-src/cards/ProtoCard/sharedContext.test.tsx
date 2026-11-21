/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { createSharedContext } from "../../sharedContext";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";

it("publishes added before initialised, and only publishes real changes", () => {
  const store = createSharedContext();
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

it("lets ProtoCard observe existing and later card data and status changes", async () => {
  const store = createSharedContext();
  const root = createRoot(document.createElement("div"));
  let latest: UseProtoCard | undefined;
  function Harness() {
    latest = useProtoCard(store);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(latest?.sharedContext.cards.repo).toBeUndefined();
    expect(latest?.shared).toEqual({ title: "ProtoCard prototype card", status: "loading" });
    await act(async () => store.update("repo", { title: "Repository & environment", status: "loading" }));
    expect(latest?.sharedContext.cards.repo).toEqual({ initialised: true, title: "Repository & environment", status: "loading" });
    await act(async () => store.update("repo", { title: "Repository & environment", status: "complete" }));
    expect(latest?.sharedContext.cards.repo).toEqual({ initialised: true, title: "Repository & environment", status: "complete" });
    await act(async () => root.unmount());

    const laterRoot = createRoot(document.createElement("div"));
    try {
      await act(async () => laterRoot.render(<Harness />));
      expect(latest?.sharedContext.cards.repo).toEqual({ initialised: true, title: "Repository & environment", status: "complete" });
    } finally {
      await act(async () => laterRoot.unmount());
    }
  } finally {
    await act(async () => root.unmount());
  }
});
