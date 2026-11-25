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
import { checkPrerequisites, type BaseCardContext } from "../components/useBaseCard";
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
  const baseCardContext = getBaseCardContext(protoReducer(initialProtoState, { type: "check-prerequisites" }));

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

it("draws the prerequisite tree under the state diagram, through published prerequisites and back around cycles", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = createAppContext();
  store.update("repo_v2", { title: "Repository", currentBaseCardStatus: "blocked", currentStatus: "blocked", githubRepository: null, prerequisiteIds: ["github_login_v2"] });
  store.update("github_login_v2", {
    title: "GitHub", currentBaseCardStatus: "ready", currentStatus: "signed-out", githubAccount: null, githubToken: null, githubMode: null,
    prerequisiteIds: ["proto_card"],
  });
  const baseCardContext = getBaseCardContext(protoReducer(initialProtoState, { type: "check-prerequisites" }));

  try {
    await act(async () => root.render(
      createElement(ThemeProvider, { theme },
        createElement(BaseCard, { baseCardContext: { ...baseCardContext, prerequisiteIds: ["repo_v2", "unknown"] as unknown as BaseCardContext["prerequisiteIds"] }, appContext: store.getSnapshot(), expanded: true, children: null })
      )
    ));
    const title = container.querySelector<HTMLElement>("#card-title-proto_card button")!;
    await act(async () => title.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 })));
    await act(async () => document.body.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.click());

    const tree = container.querySelector('svg[aria-label^="Prerequisite tree"]');
    const column = (id: string) => Number(tree!.querySelector(`[data-state="${id}"] rect`)!.getAttribute("x"));
    expect([...tree!.querySelectorAll("[data-state]")].map((node) => node.getAttribute("data-state"))).toEqual(["proto_card", "repo_v2", "github_login_v2", "unknown"]);
    // Prerequisites sit left of the cards that need them; arrows run from prerequisite to dependant.
    expect(column("github_login_v2")).toBeLessThan(column("repo_v2"));
    expect(column("repo_v2")).toBeLessThan(column("proto_card"));
    expect(tree!.querySelector('[data-from="repo_v2"][data-to="proto_card"]')).not.toBeNull();
    // "unknown" sits two columns left of the card, so its arrow runs above every card instead of through one.
    const laneY = Number(/ L \S+ (\S+)/.exec(tree!.querySelector('[data-from="unknown"][data-to="proto_card"]')!.getAttribute("d")!)![1]);
    const cardTops = [...tree!.querySelectorAll("[data-state] rect")].map((rect) => Number(rect.getAttribute("y")));
    expect(laneY).toBeLessThan(Math.min(...cardTops));
    // Neither prerequisite is complete, so both show as unmet.
    expect(tree!.querySelector('[data-state="repo_v2"] rect')?.getAttribute("stroke")).toBe(theme.palette.warning.main);
    // GitHub isn't in the card's own list; it comes in through Repository, so it and its arrow are dashed.
    expect(tree!.querySelector('[data-state="github_login_v2"] rect')?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(tree!.querySelector('[data-from="github_login_v2"][data-to="repo_v2"]')?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(tree!.querySelector('[data-state="repo_v2"] rect')?.getAttribute("stroke-dasharray")).toBeNull();
    // So is the card itself, while anything above it is unmet.
    expect(tree!.querySelector('[data-state="proto_card"] rect')?.getAttribute("fill")).toBe(theme.palette.warning.main);
    // The cycle (the card is GitHub's prerequisite) is one arrow back, not a second copy of the card.
    expect(tree!.querySelector('[data-from="proto_card"][data-to="github_login_v2"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("owns force-unlock and undo for blocked cards", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const baseCardContext = {
    cardId: "proto_card",
    title: "Blocked card",
    lifecycle: "blocked",
    prerequisiteIds: ["repo_v2"],
    unmetCardPrerequisites: ["repo_v2"],
  } as const;

  try {
    await act(async () => root.render(
      createElement(ThemeProvider, { theme },
        createElement(BaseCard, { baseCardContext, expanded: true, onToggle: () => { }, children: createElement("p", null, "Card content") })
      )
    ));
    expect(container.textContent).toContain("The following prerequisites are incomplete");
    expect(container.textContent).not.toContain("Card content");

    await act(async () => container.querySelector<HTMLButtonElement>("button.MuiLink-root")?.click());
    expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
    expect(container.textContent).toContain("Card content");

    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button.MuiLink-root")]
      .find((button) => button.textContent?.includes("Click to undo"))?.click());
    expect(container.textContent).not.toContain("Card content");
    expect(container.textContent).toContain("The following prerequisites are incomplete");
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
    baseCardContext: { ...initialProtoState.baseCardContext, unmetCardPrerequisites: ["repo_v2"] },
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
  } as unknown as BaseCardContext;
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

it("walks the published prerequisite tree, deepest unmet card first, and stops at cycles", () => {
  const store = createAppContext();
  const appRegistration = {
    cardId: "azure_app_registration_v2", title: "App registration", lifecycle: "loading",
    prerequisiteIds: ["azure_login_v2", "repo_v2"],
  } as unknown as BaseCardContext;
  const check = () => checkPrerequisites(store.getSnapshot(), appRegistration);
  store.update("azure_login_v2", { title: "Azure", currentBaseCardStatus: "complete", currentStatus: "signed-in", azureAccount: null, azureTenantId: null });
  store.update("github_login_v2", { title: "GitHub", currentBaseCardStatus: "ready", currentStatus: "signed-out", githubAccount: null, githubToken: null, githubMode: null });
  store.update("repo_v2", { title: "Repository", currentBaseCardStatus: "blocked", currentStatus: "blocked", githubRepository: null, prerequisiteIds: ["github_login_v2"] });
  expect(check()).toEqual(["github_login_v2", "repo_v2"]);

  // Repository still reports complete, but GitHub login under it isn't: the tree, not the card, finds it.
  store.update("repo_v2", { title: "Repository", currentBaseCardStatus: "complete", currentStatus: "complete", githubRepository: null, prerequisiteIds: ["github_login_v2"] });
  expect(check()).toEqual(["github_login_v2"]);

  store.update("github_login_v2", { title: "GitHub", currentBaseCardStatus: "complete", currentStatus: "signed-in", githubAccount: null, githubToken: null, githubMode: null, prerequisiteIds: ["repo_v2"] });
  expect(check()).toEqual([]);

  // A cycle back to the checking card counts as unmet instead of looping.
  store.update("github_login_v2", { title: "GitHub", currentBaseCardStatus: "complete", currentStatus: "signed-in", githubAccount: null, githubToken: null, githubMode: null, prerequisiteIds: ["azure_app_registration_v2"] });
  expect(check()).toEqual(["azure_app_registration_v2"]);
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
