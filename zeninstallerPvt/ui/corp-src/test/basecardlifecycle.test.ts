/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { createAppContext } from "../appContext";
import { lifecycleReducer, checkPrerequisites, initialLifecycle } from "../components/useBaseCard";
import { initialState as initialGithubState, reducer as githubReducer } from "../cards/GithubLoginV2/stateMachine";
import { initialState as initialProtoState, reducer as protoReducer } from "../cards/ProtoCard/stateMachine";
import { initialState as initialRepoState, reducer as repoReducer } from "../cards/RepoV2/stateMachine";

it("keeps a common lifecycle slice across card state machines", () => {
  expect(initialProtoState.lifecycle.context.lifecycle).toBe("loading");
  expect(initialRepoState.lifecycle.context.lifecycle).toBe("loading");
  expect(initialGithubState.lifecycle.context.lifecycle).toBe("loading");

  const proto = protoReducer(initialProtoState, { type: "check-prerequisites" });
  const repo = repoReducer(initialRepoState, { type: "phase-changed", phase: "ready" });
  const github = githubReducer(initialGithubState, { type: "phase-changed", phase: "ready" });
  expect(proto.lifecycle.context.lifecycle).toBe("ready");
  expect(repo.lifecycle).toMatchObject({ targetPhase: "ready", context: { lifecycle: "ready" } });
  expect(github.lifecycle).toMatchObject({ targetPhase: "ready", context: { lifecycle: "ready" } });
});

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
  expect(() => lifecycleReducer(initialLifecycle, { type: "transition", lifecycle: "complete" })).toThrow();
  for (const lifecycle of ["action", "commit"] as const) {
    expect(lifecycleReducer(initialLifecycle, { type: "transition", lifecycle }).lifecycle).toBe(lifecycle);
  }
  const ready = lifecycleReducer(initialLifecycle, { type: "transition", lifecycle: "ready" });
  expect(() => lifecycleReducer(ready, { type: "transition", lifecycle: "complete" })).toThrow();
  expect(() => lifecycleReducer(ready, { type: "transition", lifecycle: "commit" })).toThrow();
  const action = lifecycleReducer(ready, { type: "transition", lifecycle: "action" });
  expect(() => lifecycleReducer(action, { type: "transition", lifecycle: "complete" })).toThrow();
  const commit = lifecycleReducer(action, { type: "transition", lifecycle: "commit" });
  for (const context of [ready, action, commit]) {
    expect(lifecycleReducer(context, { type: "transition", lifecycle: "error" }).lifecycle).toBe("error");
    expect(() => lifecycleReducer(context, { type: "transition", lifecycle: "loading" })).toThrow();
  }
  const complete = lifecycleReducer(commit, { type: "transition", lifecycle: "complete" });
  expect(complete.lifecycle).toBe("complete");
  expect(initialLifecycle.lifecycle).toBe("loading");
  const blocked = lifecycleReducer(initialLifecycle, { type: "transition", lifecycle: "blocked" });
  expect(lifecycleReducer(blocked, { type: "transition", lifecycle: "loading" }).lifecycle).toBe("loading");
  expect(() => lifecycleReducer(blocked, { type: "transition", lifecycle: "ready" })).toThrow();
});
