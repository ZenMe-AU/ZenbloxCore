/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it } from "vitest";
import { createAppContext, SensitiveToken, type SharedCard } from "../appContext";
import BaseCard from "../components/BaseCard";
import { checkPrerequisites } from "../components/useBaseCard";
import { initialState as initialGithubState, reducer as githubReducer, toBaseCardLifecycle as githubToBaseCardLifecycle } from "../cards/GithubLoginV2/stateMachine";
import {
  canLifecycleTransition,
  getBaseCardContext,
  initialState as initialProtoState,
  reducer as protoReducer,
  stateMachine as protoStateMachine,
} from "../cards/ProtoCard/stateMachine";
import { initialState as initialRepoState, reducer as repoReducer, toBaseCardLifecycle as repoLifecycle, stateGraph as repoStateGraph } from "../cards/RepoV2/stateMachine";
import theme from "../theme";

it("owns title expansion and the state-diagram context menu without App controls", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const baseCardContext = getBaseCardContext(initialProtoState);

  try {
    await act(async () => root.render(
      createElement(ThemeProvider, { theme },
        createElement(BaseCard, { baseCardContext, children: createElement("div", null, "Card content") })
      )
    ));

    const title = container.querySelector<HTMLButtonElement>("#card-title-proto_card button");
    expect(title?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => title?.click());
    expect(title?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#card-content-proto_card")?.textContent).toContain("Card content");

    await act(async () => title?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 })));
    expect(document.body.querySelector('[role="menuitemcheckbox"]')?.textContent).toContain("Show state diagram");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("maps card-owned states to the shared BaseCard display lifecycle", () => {
  expect(initialProtoState.lifecycle).toBe("loading");
  expect(repoLifecycle(initialRepoState.lifecycle)).toBe("loading");
  expect(githubToBaseCardLifecycle(initialGithubState.lifecycle)).toBe("loading");
  expect(protoStateMachine.toBaseCardLifecycle(initialProtoState.lifecycle)).toBe("loading");
  expect(protoStateMachine.canTransition(initialProtoState, "action")).toBe(true);
  expect(protoStateMachine.canTransition({
    ...initialProtoState,
    privateContext: { ...initialProtoState.privateContext, unmetCardPrerequisites: ["repo_v2"] },
  }, "action")).toBe(false);

  const proto = protoReducer(initialProtoState, { type: "check-prerequisites" });
  const protoBaseCardContext = getBaseCardContext(proto);
  const repo = repoReducer(initialRepoState, { type: "transition", lifecycle: "action" });
  const github = githubReducer(initialGithubState, { type: "transition", lifecycle: "signing-in" });
  expect(proto.lifecycle).toBe("ready");
  expect(protoBaseCardContext.stateMachine).toEqual({ currentState: "ready", graph: protoStateMachine.graph });
  expect(repoLifecycle(repo.lifecycle)).toBe("action");
  expect(repoStateGraph.loading.transitions).toContain("action");
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
  store.update("github_login_v2", {
    title: "Login", currentBaseCardStatus: "complete", currentStatus: "signed-in",
    githubAccount: null, githubToken: null, githubMode: null,
  });
  store.update("repo_v2", { title: "Repository", currentBaseCardStatus: "ready", currentStatus: "ready", githubRepository: null });
  store.update("proto_card", { title: "ProtoCard", currentBaseCardStatus: "complete", currentStatus: "complete" });
  expect(check()).toEqual(["repo_v2", "proto_card", "unknown"]);
  store.update("repo_v2", { title: "Repository", currentBaseCardStatus: "complete", currentStatus: "complete", githubRepository: null });
  expect(check()).toEqual(["proto_card", "unknown"]);
  unsubscribe();
});

it("stores card-contributed data generically and compares plain snapshots structurally", () => {
  const store = createAppContext();
  const token = new SensitiveToken("test-secret");
  const shared: SharedCard<"github_login_v2"> = {
    title: "GitHub login 2",
    currentBaseCardStatus: "complete",
    currentStatus: "signed-in",
    githubAccount: { login: "user" },
    githubToken: token,
    githubMode: "direct",
  };

  store.update("github_login_v2", shared);
  const snapshot = store.getSnapshot();
    expect(snapshot.cards.github_login_v2).toMatchObject({
    initialised: true,
      currentBaseCardStatus: "complete",
      currentStatus: "signed-in",
    githubAccount: { login: "user" },
    githubToken: token,
    githubMode: "direct",
  });
  expect(JSON.stringify(snapshot)).not.toContain("test-secret");

  store.update("github_login_v2", { ...shared, githubAccount: { login: "user" } });
  expect(store.getSnapshot()).toBe(snapshot);
  store.update("github_login_v2", { ...shared, githubToken: new SensitiveToken("test-secret") });
  expect(store.getSnapshot()).not.toBe(snapshot);
});

it("rejects unregistered IDs and incomplete migrated-card payloads at compile time", () => {
  const store = createAppContext();
  const invalidUpdates = () => {
    // @ts-expect-error IDs must be registered by a migrated card's module augmentation.
    store.update("locally_defined_card", { title: "Local card", currentBaseCardStatus: "loading", currentStatus: "loading" });
    // @ts-expect-error Every GitHubLoginV2 payload must include its complete nullable projection.
    store.update("github_login_v2", { title: "GitHub", currentBaseCardStatus: "loading", currentStatus: "loading" });
  };
  void invalidUpdates;
});

it("keeps ProtoCard transition rules local to its state machine", () => {
  expect(canLifecycleTransition("loading", "ready")).toBe(true);
  expect(canLifecycleTransition("loading", "complete")).toBe(false);
  expect(canLifecycleTransition("ready", "action")).toBe(true);
  expect(canLifecycleTransition("ready", "commit")).toBe(false);
  expect(canLifecycleTransition("commit", "complete")).toBe(true);
  expect(canLifecycleTransition("blocked", "loading")).toBe(true);
});
