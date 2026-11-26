/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import type { Lifecycle } from "../../components/useBaseCard";
import { createAppContext, SensitiveToken } from "../../appContext";
import theme from "../../theme";
import ProtoCard from "./ProtoCard";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";
import { getBaseCardContext, initialState, reducer as protoReducer } from "./stateMachine";

type TestAppStore = ReturnType<typeof createAppContext>;

function ProtoCardHarness({ store }: { store: TestAppStore }) {
  return <ThemeProvider theme={theme}><ProtoCard {...store} /></ThemeProvider>;
}

function currentProtoCard(store: TestAppStore) {
  const card = store.getSnapshot().cards.proto_card;
  return card?.initialised ? card : undefined;
}

async function expandProtoCard(container: HTMLElement) {
  const toggle = container.querySelector<HTMLButtonElement>("#card-title-proto_card button");
  expect(toggle).not.toBeNull();
  await act(async () => toggle?.click());
}

async function setPrerequisite(container: HTMLElement, index: number, cardId: string) {
  const select = container.querySelectorAll<HTMLSelectElement>("#proto-card-prerequisites select")[index];
  expect(select).toBeDefined();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, cardId);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function publishGithubLogin(
  store: TestAppStore,
  currentBaseCardStatus: Lifecycle,
  currentStatus: string,
  githubAccount: { login: string } | null = null,
  githubToken: SensitiveToken | null = null,
  githubMode: "direct" | "backend" | null = null,
) {
  store.update("github_login_v2", {
    title: "GitHub login 2",
    currentBaseCardStatus,
    currentStatus,
    githubAccount,
    githubToken,
    githubMode,
  });
}

function publishRepo(store: TestAppStore, currentBaseCardStatus: Lifecycle, currentStatus = currentBaseCardStatus) {
  store.update("repo_v2", {
    title: "Repository & environment 2",
    currentBaseCardStatus,
    currentStatus,
    githubRepository: null,
  });
}

function publishProto(store: TestAppStore, currentBaseCardStatus: Lifecycle, currentStatus = currentBaseCardStatus) {
  store.update("proto_card", { title: "ProtoCard", currentBaseCardStatus, currentStatus });
}

describe("ProtoCard state machine", () => {
  const appStore = createAppContext();
  it("checks prerequisites before entering ready or blocked and guards operations", () => {
    expect(initialState.lifecycle).toBe("loading");
    expect(() => protoReducer(initialState, { type: "transition", lifecycle: "complete" })).toThrow();
    const ready = protoReducer(initialState, { type: "check-prerequisites" });
    expect(getBaseCardContext(ready)).toMatchObject({ cardId: "proto_card", summary: "Ready to proceed", lifecycle: "ready", unmetCardPrerequisites: [] });
    const checking = protoReducer(ready, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    expect(getBaseCardContext(checking)).toMatchObject({ lifecycle: "loading", unmetCardPrerequisites: ["repo_v2"] });
    const blocked = protoReducer(checking, { type: "check-prerequisites" });
    expect(getBaseCardContext(blocked)).toMatchObject({ lifecycle: "blocked", summary: "Blocked due to incomplete prerequisites: repo_v2", unmetCardPrerequisites: ["repo_v2"] });
    expect(() => protoReducer(blocked, { type: "transition", lifecycle: "complete" })).toThrow();
    expect(blocked.baseCardContext.unmetCardPrerequisites).toEqual(["repo_v2"]);
    const available = protoReducer(protoReducer(blocked, { type: "sync-card-prerequisites", unmet: [] }), { type: "check-prerequisites" });
    const action = protoReducer(available, { type: "transition", lifecycle: "action" });
    const commit = protoReducer(action, { type: "transition", lifecycle: "commit" });
    const complete = protoReducer(commit, { type: "transition", lifecycle: "complete" });
    expect(getBaseCardContext(complete)).toMatchObject({ lifecycle: "complete", done: true });
    const rechecking = protoReducer(complete, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    expect(getBaseCardContext(rechecking)).toMatchObject({ lifecycle: "loading", done: false });
    expect(getBaseCardContext(protoReducer(rechecking, { type: "check-prerequisites" })).lifecycle).toBe("blocked");
    expect(protoReducer(ready, { type: "check-prerequisites" })).toBe(ready);
  });

  it("resets the lifecycle when card prerequisites change", () => {
    const customized = { ...initialState, baseCardContext: { ...initialState.baseCardContext, title: "Custom title" } };
    const ready = protoReducer(customized, { type: "check-prerequisites" });
    const action = protoReducer(ready, { type: "transition", lifecycle: "action" });
    const commit = protoReducer(action, { type: "transition", lifecycle: "commit" });
    for (const state of [ready, action, commit]) {
      expect(() => protoReducer(state, { type: "transition", lifecycle: "loading" })).toThrow();
      const missingRepo = protoReducer(state, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
      expect(getBaseCardContext(missingRepo)).toMatchObject({ title: "Custom title", lifecycle: "loading", unmetCardPrerequisites: ["repo_v2"] });
      expect(getBaseCardContext(protoReducer(missingRepo, { type: "check-prerequisites" }))).toMatchObject({ title: "Custom title", lifecycle: "blocked" });
    }
  });

  it.each(["action", "commit"] as const)("allows loading to transition to %s only with prerequisites met", (lifecycle) => {
    const entered = protoReducer(initialState, { type: "transition", lifecycle });
    expect(entered.lifecycle).toBe(lifecycle);
    expect(protoReducer(entered, { type: "check-prerequisites" })).toBe(entered);
    const missingRepo = protoReducer(initialState, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    expect(() => protoReducer(missingRepo, { type: "transition", lifecycle })).toThrow();
  });

  it("shows a loading layout instead of blocked or interactive content while checking", async () => {
    vi.useFakeTimers();
    const store = createAppContext();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ProtoCardHarness store={store} />));
      await expandProtoCard(container);
      const content = container.querySelector("#card-content-proto_card");
      expect(container.querySelector("#card-title-proto_card")?.textContent).toContain("Checking prerequisites...");
      expect(container.querySelector("#card-title-proto_card")?.textContent).toContain("ProtoCard");
      expect(content?.querySelector('[role="status"]')?.textContent).toBe("Loading...");
      expect(content?.querySelector(".MuiCircularProgress-root")).not.toBeNull();
      expect(content?.textContent).not.toContain("force unlock");
      expect(content?.querySelector('[aria-label="Lifecycle diagram"]')).toBeNull();
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Checking prerequisites");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });

  it("offers force unlock when a card prerequisite blocks the card", async () => {
    vi.useFakeTimers();
    const store = createAppContext();
    publishGithubLogin(store, "complete", "signed-in");
    publishRepo(store, "ready");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ProtoCardHarness store={store} />));
      await expandProtoCard(container);
      await act(async () => vi.advanceTimersByTime(2000));
      await setPrerequisite(container, 0, "repo_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("repo_v2");
      expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).not.toBeNull();
      await act(async () => unlock?.click());
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      const undo = [...container.querySelectorAll<HTMLButtonElement>("button.MuiLink-root")]
        .find((button) => button.textContent?.includes("Click to undo"));
      await act(async () => undo?.click());
      expect(container.textContent).toContain("The following prerequisites are incomplete");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });

  it("restarts the loading delay when prerequisites change and cancels it on unmount", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    let latest: UseProtoCard | undefined;
    function Harness() {
      latest = useProtoCard(appStore);
      return null;
    }

    try {
      await act(async () => root.render(<Harness />));
      await act(async () => vi.advanceTimersByTime(1500));
      await act(async () => latest?.privateContext.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo_v2" }));
      await act(async () => vi.advanceTimersByTime(1999));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(1));
      expect(latest?.baseCardContext.lifecycle).toBe("blocked");
      await act(async () => latest?.privateContext.dispatch({ type: "card-prerequisite", index: 0, cardId: "" }));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => root.unmount());
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });

  it("checks both editable card IDs against live completion and reacts to changes", async () => {
    vi.useFakeTimers();
    const store = createAppContext();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    async function selectPrerequisite(index: number, value: string) {
      await setPrerequisite(container, index, value);
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("loading");
      expect(container.querySelector("#proto-card-prerequisites")).toBeNull();
      expect(container.querySelectorAll("select")).toHaveLength(0);
    }
    async function openPrerequisites() {
      const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-prerequisites"]');
      expect(toggle).not.toBeNull();
      if (toggle?.getAttribute("aria-expanded") === "false") await act(async () => toggle.click());
    }
    try {
      publishGithubLogin(store, "complete", "signed-in");
      publishRepo(store, "ready");
      publishProto(store, "complete");
      await act(async () => root.render(<ProtoCardHarness store={store} />));
      await expandProtoCard(container);
      await act(async () => vi.advanceTimersByTime(2000));
      const panel = container.querySelector("#proto-card-prerequisites")!;
      expect(container.querySelectorAll("select")).toHaveLength(2);
      expect(panel.querySelectorAll("select")).toHaveLength(2);
      expect(panel.querySelector('input[type="checkbox"]')).toBeNull();
      expect([...panel.querySelectorAll("button")].find((button) => button.textContent === "Block")).toBeUndefined();
      const prerequisiteSelect = panel.querySelector<HTMLSelectElement>("select")!;
      expect([...prerequisiteSelect.options].map((option) => option.value)).toContain("github_login_v2");
      expect([...prerequisiteSelect.options].map((option) => option.value)).not.toContain("unknown_card");
      expect([...prerequisiteSelect.options].map((option) => option.value)).not.toContain("proto_card");
      await selectPrerequisite(0, "github_login_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("ready");
      await selectPrerequisite(1, "repo_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)).toMatchObject({ currentBaseCardStatus: "blocked" });
      expect(container.textContent).toContain("repo_v2");
      await act(async () => publishRepo(store, "complete"));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("ready");
      await act(async () => publishGithubLogin(store, "error", "expired"));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)).toMatchObject({ currentBaseCardStatus: "blocked" });
      expect(container.querySelectorAll("select")).toHaveLength(0);
      await act(async () => container.querySelector<HTMLButtonElement>("button.MuiLink-root")?.click());
      await openPrerequisites();
      const selects = container.querySelectorAll<HTMLSelectElement>("select");
      expect([...selects[0].options].map((option) => option.value)).not.toContain("unknown_card");
      expect([...selects[0].options].map((option) => option.value)).not.toContain("proto_card");
      await setPrerequisite(container, 0, "repo_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("ready");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });

  it.each(["action", "commit"] as const)("cancels the loading check after transitioning to %s", async (lifecycle) => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    let latest: UseProtoCard | undefined;
    function Harness() {
      latest = useProtoCard(appStore);
      return null;
    }

    try {
      await act(async () => root.render(<Harness />));
      await act(async () => latest?.privateContext.dispatch({ type: "transition", lifecycle }));
      expect(latest?.baseCardContext.lifecycle).toBe(lifecycle);
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.lifecycle).toBe(lifecycle);
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });

  it("force-unlocks through the default card entrypoint without satisfying prerequisites", async () => {
    vi.useFakeTimers();
    const store = createAppContext();
    publishGithubLogin(store, "complete", "signed-in");
    publishRepo(store, "ready");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ProtoCardHarness store={store} />));
      await expandProtoCard(container);
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("ready");
      await setPrerequisite(container, 0, "repo_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("blocked");
      expect(container.textContent).toContain("repo_v2");

      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).not.toBeNull();
      await act(async () => unlock?.click());
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      const undo = [...container.querySelectorAll<HTMLButtonElement>("button.MuiLink-root")]
        .find((button) => button.textContent?.includes("Click to undo"));
      await act(async () => undo?.click());
      expect(container.textContent).toContain("The following prerequisites are incomplete");

      await act(async () => publishRepo(store, "complete"));
      await act(async () => vi.advanceTimersByTime(2000));
      expect(currentProtoCard(store)?.currentBaseCardStatus).toBe("ready");
      expect(container.textContent).not.toContain("This card is force-unlocked;");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });
});
