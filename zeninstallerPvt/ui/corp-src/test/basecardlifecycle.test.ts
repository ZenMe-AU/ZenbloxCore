/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { createAppContext } from "../appContext";
import { cardLifecycleReducer, checkPrerequisites, initialCardLifecycle } from "../components/useBaseCard";

it("checks registered, initialised and complete prerequisites and rejects self-dependencies", () => {
  const store = createAppContext();
  const baseCardContext = {
    cardId: "proto_card", title: "ProtoCard", lifecycle: "loading",
    prerequisiteIds: ["", "  ", " github_login_v2 ", "repo_v2", "proto_card", "unknown"],
  } as const;
  const check = () => checkPrerequisites(store.getSnapshot(), baseCardContext);
  expect(check()).toEqual(["github_login_v2", "repo_v2", "proto_card", "unknown"]);
  const unsubscribe = store.subscribe((event) => {
    if (event.type === "added") expect(check()).toContain(event.cardId);
  });
  store.update("github_login_v2", { title: "Login", status: "complete" });
  store.update("repo_v2", { title: "Repository", status: "ready" });
  store.update("proto_card", { title: "ProtoCard", status: "complete" });
  expect(check()).toEqual(["repo_v2", "proto_card", "unknown"]);
  store.update("repo_v2", { title: "Repository", status: "complete" });
  expect(check()).toEqual(["proto_card", "unknown"]);
  unsubscribe();
});

it("applies permitted lifecycle transitions and rejects invalid ones", () => {
  expect(() => cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "complete" })).toThrow();
  for (const lifecycle of ["action", "commit"] as const) {
    expect(cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle }).lifecycle).toBe(lifecycle);
  }
  const ready = cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "ready" });
  expect(() => cardLifecycleReducer(ready, { type: "transition", lifecycle: "complete" })).toThrow();
  expect(() => cardLifecycleReducer(ready, { type: "transition", lifecycle: "commit" })).toThrow();
  const action = cardLifecycleReducer(ready, { type: "transition", lifecycle: "action" });
  expect(() => cardLifecycleReducer(action, { type: "transition", lifecycle: "complete" })).toThrow();
  const commit = cardLifecycleReducer(action, { type: "transition", lifecycle: "commit" });
  for (const context of [ready, action, commit]) {
    expect(cardLifecycleReducer(context, { type: "transition", lifecycle: "error" }).lifecycle).toBe("error");
    expect(() => cardLifecycleReducer(context, { type: "transition", lifecycle: "loading" })).toThrow();
  }
  const complete = cardLifecycleReducer(commit, { type: "transition", lifecycle: "complete" });
  expect(complete.lifecycle).toBe("complete");
  expect(initialCardLifecycle.lifecycle).toBe("loading");
  const blocked = cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "blocked" });
  expect(cardLifecycleReducer(blocked, { type: "transition", lifecycle: "loading" }).lifecycle).toBe("loading");
  expect(() => cardLifecycleReducer(blocked, { type: "transition", lifecycle: "ready" })).toThrow();
});
