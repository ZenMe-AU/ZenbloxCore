/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { createAppContext } from "../appContext";
import { checkPrerequisites } from "../components/useBaseCard";
import { initialState as initialGithubState, reducer as githubReducer, toBaseCardLifecycle as githubToBaseCardLifecycle } from "../cards/GithubLoginV2/stateMachine";
import {
  canLifecycleTransition,
  initialState as initialProtoState,
  reducer as protoReducer,
  stateMachine as protoStateMachine,
} from "../cards/ProtoCard/stateMachine";
import { initialState as initialRepoState, reducer as repoReducer, toBaseLifecycle as repoLifecycle } from "../cards/RepoV2/stateMachine";

it("maps card-owned states to the shared BaseCard display lifecycle", () => {
  expect(initialProtoState.lifecycle).toBe("loading");
  expect(repoLifecycle(initialRepoState.phase)).toBe("loading");
  expect(githubToBaseCardLifecycle(initialGithubState.lifecycle)).toBe("loading");
  expect(protoStateMachine.toBaseCardLifecycle(initialProtoState.lifecycle)).toBe("loading");
  expect(protoStateMachine.canTransition(initialProtoState, "action")).toBe(true);
  expect(protoStateMachine.canTransition({
    ...initialProtoState,
    protoCardContext: { ...initialProtoState.protoCardContext, unmetCardPrerequisites: ["repo_v2"] },
  }, "action")).toBe(false);

  const proto = protoReducer(initialProtoState, { type: "check-prerequisites" });
  const repo = repoReducer(initialRepoState, { type: "phase-changed", phase: "working" });
  const github = githubReducer(initialGithubState, { type: "transition", lifecycle: "signing-in" });
  expect(proto.lifecycle).toBe("ready");
  expect(repoLifecycle(repo.phase)).toBe("action");
  expect(githubToBaseCardLifecycle(github.lifecycle)).toBe("action");
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

it("keeps ProtoCard transition rules local to its state machine", () => {
  expect(canLifecycleTransition("loading", "ready")).toBe(true);
  expect(canLifecycleTransition("loading", "complete")).toBe(false);
  expect(canLifecycleTransition("ready", "action")).toBe(true);
  expect(canLifecycleTransition("ready", "commit")).toBe(false);
  expect(canLifecycleTransition("commit", "complete")).toBe(true);
  expect(canLifecycleTransition("blocked", "loading")).toBe(true);
});
