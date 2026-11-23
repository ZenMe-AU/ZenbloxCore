/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import type { Lifecycle } from "../../components/useBaseCard";
import BaseCard from "../../components/BaseCard";
import { createAppContext, SensitiveToken } from "../../appContext";
import theme from "../../theme";
import { CardContentMain } from "./ProtoCard";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";
import { canLifecycleTransition, getBaseCardContext, initialState, reducer as protoReducer } from "./stateMachine";

type TestAppStore = ReturnType<typeof createAppContext>;

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
    expect(getBaseCardContext(ready)).toMatchObject({ cardId: "proto_card", summary: "Summary", lifecycle: "ready", unmetCardPrerequisites: [] });
    const checking = protoReducer(ready, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    expect(getBaseCardContext(checking)).toMatchObject({ lifecycle: "loading", unmetCardPrerequisites: ["repo_v2"] });
    const blocked = protoReducer(checking, { type: "check-prerequisites" });
    expect(getBaseCardContext(blocked)).toMatchObject({ lifecycle: "blocked", summary: "Blocked: repo_v2", unmetCardPrerequisites: ["repo_v2"] });
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
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const state = protoReducer(initialState, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    const protoCard: UseProtoCard = {
      baseCardContext: { ...getBaseCardContext(state), title: "Context title" },
      privateContext: { ...state.privateContext, appContext: appStore.getSnapshot(), dispatch: vi.fn() },
    };
    try {
      await act(async () => root.render(
        <ThemeProvider theme={theme}>
          <BaseCard baseCardContext={protoCard.baseCardContext} appContext={protoCard.privateContext.appContext} expanded onToggle={() => { }}>
            <CardContentMain {...protoCard} />
          </BaseCard>
        </ThemeProvider>
      ));
      const content = container.querySelector("#card-content-proto_card");
      expect(container.querySelector("#card-title-proto_card")?.textContent).toContain("Context title");
      expect(container.querySelector("#card-title-proto_card")?.textContent).toContain("Checking prerequisites...");
      expect(container.querySelector("#card-title-proto_card")?.textContent).not.toContain("Legacy summary");
      expect(content?.querySelector('[role="status"]')?.textContent).toBe("Loading...");
      expect(content?.querySelector(".MuiCircularProgress-root")).not.toBeNull();
      expect(content?.textContent).not.toContain("force unlock");
      expect(content?.textContent).not.toContain("Simulated lifecycle actions");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Checking prerequisites");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("offers force unlock when a card prerequisite blocks the card", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const state = protoReducer(protoReducer(initialState, { type: "sync-card-prerequisites", unmet: ["repo_v2"] }), { type: "check-prerequisites" });
    const protoCard: UseProtoCard = {
      baseCardContext: getBaseCardContext(state),
      privateContext: { ...state.privateContext, appContext: appStore.getSnapshot(), dispatch: vi.fn() },
    };
    try {
      await act(async () => root.render(
        <ThemeProvider theme={theme}>
          <BaseCard baseCardContext={protoCard.baseCardContext} appContext={protoCard.privateContext.appContext} expanded onToggle={() => { }}>
            <CardContentMain {...protoCard} />
          </BaseCard>
        </ThemeProvider>
      ));
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
    let latest: UseProtoCard | undefined;
    function Harness() {
      latest = useProtoCard(store);
      return (
        <ThemeProvider theme={theme}>
          <BaseCard baseCardContext={latest.baseCardContext} appContext={latest.privateContext.appContext}>
            <CardContentMain {...latest} />
          </BaseCard>
        </ThemeProvider>
      );
    }
    async function selectPrerequisite(index: number, value: string) {
      const select = container.querySelectorAll<HTMLSelectElement>("select")[index];
      expect(select).toBeDefined();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
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
      await act(async () => root.render(<Harness />));
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
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      await selectPrerequisite(1, "repo_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext).toMatchObject({ lifecycle: "blocked", unmetCardPrerequisites: ["repo_v2"] });
      expect(container.textContent).toContain("repo_v2");
      await act(async () => publishRepo(store, "complete"));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      await act(async () => {
        latest?.privateContext.dispatch({ type: "transition", lifecycle: "action" });
        latest?.privateContext.dispatch({ type: "transition", lifecycle: "commit" });
        latest?.privateContext.dispatch({ type: "transition", lifecycle: "complete" });
      });
      expect(latest?.baseCardContext.done).toBe(true);
      await act(async () => publishGithubLogin(store, "error", "expired"));
      expect(latest?.baseCardContext.done).toBe(false);
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext).toMatchObject({ lifecycle: "blocked", unmetCardPrerequisites: ["github_login_v2"] });
      expect(container.querySelectorAll("select")).toHaveLength(0);
      await act(async () => container.querySelector<HTMLButtonElement>("button.MuiLink-root")?.click());
      await openPrerequisites();
      const selects = container.querySelectorAll<HTMLSelectElement>("select");
      expect([...selects[0].options].map((option) => option.value)).not.toContain("unknown_card");
      expect([...selects[0].options].map((option) => option.value)).not.toContain("proto_card");
      await selectPrerequisite(0, "repo_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
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

  it("force-unlocks the prototype without satisfying its prerequisites", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root = createRoot(container);
    let latest: UseProtoCard | undefined;

    function Harness() {
      const protoCard = useProtoCard(appStore);
      latest = protoCard;
      return (
        <ThemeProvider theme={theme}>
          <BaseCard
            baseCardContext={protoCard.baseCardContext}
            appContext={protoCard.privateContext.appContext}
            blockedIntro={<span>The ProtoCard is a prototype card that shows how to implement new cards.</span>}
          >
            <CardContentMain {...protoCard} />
          </BaseCard>
        </ThemeProvider>
      );
    }

    async function openPrerequisites() {
      const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-prerequisites"]');
      expect(toggle).not.toBeNull();
      if (toggle?.getAttribute("aria-expanded") === "false") {
        await act(async () => toggle.click());
      }
      expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    }

    try {
      await act(async () => root.render(<Harness />));
      expect(container.textContent).toContain("Loading...");
      await act(async () => vi.advanceTimersByTime(1999));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(1));
      expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
      expect(container.textContent).toContain("Lifecycle: ready");
      expect(latest?.baseCardContext.cardId).toBe("proto_card");
      expect(latest?.baseCardContext.summary).toBe("Ready to proceed");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Ready");
      expect(container.textContent).not.toContain("Legacy prerequisite");
      const diagram = container.querySelector('[aria-label="Lifecycle diagram"]');
      expect(diagram).not.toBeNull();
      const states: Lifecycle[] = ["loading", "blocked", "ready", "action", "commit", "complete", "error", "forceUnlocked"];
      const expectedEdges = states.flatMap((from) => states
        .filter((to) => canLifecycleTransition(from, to))
        .map((to) => `${from}-${to}`));
      const displayedEdges = [...diagram!.querySelectorAll("[data-from][data-to]")]
        .map((edge) => `${edge.getAttribute("data-from")}-${edge.getAttribute("data-to")}`);
      expect(displayedEdges.sort()).toEqual(expectedEdges.sort());
      expect(diagram?.querySelector('[aria-current="step"]')?.textContent).toBe("Ready");
      expect([...diagram!.querySelectorAll("button")].find((button) => button.textContent === "Loading")?.disabled).toBe(true);
      const prerequisitesToggle = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-prerequisites"]');
      const resultsToggle = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-results"]');
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("true");
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("false");
      await act(async () => prerequisitesToggle?.click());
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("false");
      await act(async () => prerequisitesToggle?.click());
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("#proto-card-prerequisites")?.textContent).toContain("Lifecycle: ready");
      await act(async () => {
        publishRepo(appStore, "ready");
        publishGithubLogin(appStore, "complete", "signed-in", { login: "test-user" }, new SensitiveToken("test-secret"), "direct");
      });
      await act(async () => resultsToggle?.click());
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("true");
      for (const name of ["privateContext", "baseCardContext", "appContext"] as const) {
        const yaml = container.querySelector(`[aria-label="${name} YAML"] pre`)?.textContent;
        expect(yaml).toBeDefined();
        const privateState = {};
        const expected = name === "appContext"
          ? JSON.parse(JSON.stringify(latest?.privateContext.appContext))
          : name === "privateContext" ? privateState : latest?.baseCardContext;
        expect(parse(yaml!)).toEqual(expected);
      }
      let appYaml = container.querySelector('[aria-label="appContext YAML"] pre')?.textContent;
      expect(container.querySelector('[aria-label="appContext YAML"] pre')?.getAttribute("data-sensitive")).toBe("true");
      expect(appYaml).not.toContain("test-secret");
      expect(parse(appYaml!).cards.repo_v2.currentBaseCardStatus).toBe("ready");
      await act(async () => publishRepo(appStore, "complete"));
      appYaml = container.querySelector('[aria-label="appContext YAML"] pre')?.textContent;
      expect(parse(appYaml!).cards.repo_v2.currentBaseCardStatus).toBe("complete");
      const separator = container.querySelector<HTMLDivElement>('[aria-label="Resize privateContext column"]');
      expect(separator?.getAttribute("aria-valuenow")).toBe("33");
      await act(async () => separator?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
      expect(separator?.getAttribute("aria-valuenow")).toBe("35");
      await act(async () => prerequisitesToggle?.click());
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("true");
      await openPrerequisites();
      const cardToggle = container.querySelector<HTMLButtonElement>("#card-title-proto_card button");
      expect(cardToggle?.getAttribute("aria-expanded")).toBe("false");
      await act(async () => cardToggle?.click());
      expect(cardToggle?.getAttribute("aria-expanded")).toBe("true");
      await act(async () => {
        latest?.privateContext.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo_v2" });
        publishRepo(appStore, "ready");
      });
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Blocked: repo_v2");
      expect(latest?.baseCardContext.summary).toContain("Blocked: repo_v2");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Blocked");
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect(container.textContent).toContain("The following prerequisites are incomplete");
      const content = container.querySelector("#card-content-proto_card");
      expect(content?.textContent?.match(/The ProtoCard is a prototype card/g)).toHaveLength(1);
      expect(content?.textContent).not.toContain("Simulated app state");
      expect(content?.textContent).not.toContain("Lifecycle:");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Loading")).toBeUndefined();
      expect(container.textContent).toContain("repo_v2");
      const firstUnlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(firstUnlock).not.toBeNull();
      await act(async () => firstUnlock?.click());
      expect(container.querySelector('[aria-controls="proto-card-prerequisites"]')?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector('[aria-controls="proto-card-results"]')?.getAttribute("aria-expanded")).toBe("false");
      await openPrerequisites();
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect(container.textContent).toContain("Lifecycle: blocked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      expect(container.querySelector('[aria-label="Lifecycle diagram"] [aria-current="step"]')?.textContent).toBe("Blocked");
      expect(latest?.baseCardContext.unmetCardPrerequisites).toEqual(["repo_v2"]);
      const complete = [...container.querySelectorAll("button")].find((button) => button.textContent === "Complete");
      expect(complete).toBeDefined();
      expect(complete?.disabled).toBe(true);
      await act(async () => publishRepo(appStore, "complete"));
      await act(async () => vi.advanceTimersByTime(2000));
      await openPrerequisites();
      expect(container.textContent).toContain("Lifecycle: ready");
      expect(container.textContent).not.toContain("This card is force-unlocked;");
      const readyComplete = [...container.querySelectorAll("button")].find((button) => button.textContent === "Complete");
      expect(readyComplete?.disabled).toBe(true);
      const currentResults = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-results"]');
      await act(async () => currentResults?.click());
      const action = [...container.querySelectorAll("button")].find((button) => button.textContent === "Action");
      expect(action?.disabled).toBe(false);
      await act(async () => action?.click());
      expect(container.textContent).toContain("Lifecycle: action");
      expect(latest?.baseCardContext.lifecycle).toBe("action");
      expect(container.querySelector('[aria-controls="proto-card-prerequisites"]')?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector('[aria-controls="proto-card-results"]')?.getAttribute("aria-expanded")).toBe("true");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Loading")?.disabled).toBe(true);
      expect(readyComplete?.disabled).toBe(true);
      await act(async () => currentResults?.click());
      expect(currentResults?.getAttribute("aria-expanded")).toBe("false");
      const commit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Commit");
      expect(commit?.disabled).toBe(false);
      await act(async () => commit?.click());
      expect(container.textContent).toContain("Lifecycle: commit");
      expect(latest?.baseCardContext.lifecycle).toBe("commit");
      const baseYaml = container.querySelector('[aria-label="baseCardContext YAML"] pre')?.textContent;
      expect(parse(baseYaml!)).toEqual(JSON.parse(JSON.stringify(latest?.baseCardContext)));
      expect(container.querySelector('[aria-controls="proto-card-prerequisites"]')?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector('[aria-controls="proto-card-results"]')?.getAttribute("aria-expanded")).toBe("true");
      const commitResults = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-results"]');
      await act(async () => commitResults?.click());
      expect(commitResults?.getAttribute("aria-expanded")).toBe("false");
      await act(async () => commitResults?.click());
      expect(commitResults?.getAttribute("aria-expanded")).toBe("true");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Loading")?.disabled).toBe(true);
      expect(readyComplete?.disabled).toBe(false);
      await openPrerequisites();
      await act(async () => readyComplete?.click());
      expect(container.textContent).toContain("Lifecycle: complete");
      expect(container.querySelector('[aria-controls="proto-card-prerequisites"]')?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector('[aria-controls="proto-card-results"]')?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector('[aria-label="Lifecycle diagram"] [aria-current="step"]')?.textContent).toBe("Complete");
      await openPrerequisites();
      const reload = [...container.querySelectorAll("button")].find((button) => button.textContent === "Loading");
      expect(reload?.disabled).toBe(false);
      await act(async () => reload?.click());
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Lifecycle: ready");
      await openPrerequisites();
      const readyPrerequisites = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-prerequisites"]');
      const readyResults = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-results"]');
      await act(async () => readyPrerequisites?.click());
      await act(async () => readyResults?.click());
      await act(async () => latest?.privateContext.dispatch({ type: "transition", lifecycle: "error" }));
      expect(latest?.baseCardContext.lifecycle).toBe("error");
      expect(container.querySelector('[aria-controls="proto-card-prerequisites"]')?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector('[aria-controls="proto-card-results"]')?.getAttribute("aria-expanded")).toBe("true");
      await openPrerequisites();
      const errorReload = [...container.querySelectorAll("button")].find((button) => button.textContent === "Loading");
      await act(async () => errorReload?.click());
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      expect(container.querySelector('[aria-controls="proto-card-prerequisites"]')?.getAttribute("aria-expanded")).toBe("true");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Block")).toBeUndefined();
      await act(async () => {
        publishRepo(appStore, "ready");
      });
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Blocked: repo_v2");
      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).not.toBeNull();
      await act(async () => unlock?.click());
      await openPrerequisites();
      expect(container.textContent).toContain("Lifecycle: blocked");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Blocked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Blocked");
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Complete")?.disabled).toBe(true);
      await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button.MuiLink-root")]
        .find((button) => button.textContent?.includes("Click to undo"))?.click());
      expect(container.textContent).toContain("The following prerequisites are incomplete");
      expect(container.querySelector('[aria-label="Lifecycle diagram"]')).toBeNull();
      const forceAgain = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(forceAgain).not.toBeNull();
      await act(async () => forceAgain?.click());
      await openPrerequisites();
      expect(latest?.baseCardContext.lifecycle).toBe("blocked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");

      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => root.render(<Harness />));
      await act(async () => vi.advanceTimersByTime(2000));
      await act(async () => latest?.privateContext.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo_v2" }));
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("The following prerequisites are incomplete");
      expect(container.textContent).not.toContain("This card is force-unlocked;");
      const unlockAfterRemount = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      await act(async () => unlockAfterRemount?.click());
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
    } finally {
      await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button.MuiLink-root")]
        .find((button) => button.textContent?.includes("Click to undo"))?.click());
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });
});
