/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { canCardTransition, type CardLifecycle } from "../../components/useBaseCard";
import { createAppContext, SensitiveToken } from "../../appContext";
import theme from "../../theme";
import ProtoCard from "./ProtoCard";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";
import { getBaseCardContext, initialState, protoReducer } from "./stateMachine";

describe("ProtoCard state machine", () => {
  const appStore = createAppContext();
  it("checks prerequisites before entering ready or blocked and guards operations", () => {
    expect(initialState.baseCardContext.lifecycle).toBe("loading");
    expect(() => protoReducer(initialState, { type: "transition", lifecycle: "complete" })).toThrow();
    const ready = protoReducer(initialState, { type: "check-prerequisites" });
    expect(getBaseCardContext(ready)).toMatchObject({ cardId: "proto_card", summary: "Summary", lifecycle: "ready", unmetCardPrerequisites: [] });
    const checking = protoReducer(ready, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    expect(getBaseCardContext(checking)).toMatchObject({ lifecycle: "loading", unmetCardPrerequisites: ["repo_v2"] });
    const blocked = protoReducer(checking, { type: "check-prerequisites" });
    expect(getBaseCardContext(blocked)).toMatchObject({ lifecycle: "blocked", summary: "Blocked: repo_v2", unmetCardPrerequisites: ["repo_v2"] });
    expect(() => protoReducer(blocked, { type: "transition", lifecycle: "complete" })).toThrow();
    const forced = protoReducer(blocked, { type: "force-unlock", value: true });
    expect(forced.protoCardContext.forceUnlocked).toBe(true);
    expect(forced.baseCardContext.lifecycle).toBe("blocked");
    expect(forced.protoCardContext.unmetCardPrerequisites).toEqual(["repo_v2"]);
    expect(() => protoReducer(forced, { type: "transition", lifecycle: "complete" })).toThrow();
    const available = protoReducer(protoReducer(blocked, { type: "sync-card-prerequisites", unmet: [] }), { type: "check-prerequisites" });
    const action = protoReducer(available, { type: "transition", lifecycle: "action" });
    const commit = protoReducer(action, { type: "transition", lifecycle: "commit" });
    const complete = protoReducer(commit, { type: "transition", lifecycle: "complete" });
    expect(getBaseCardContext(complete)).toMatchObject({ lifecycle: "complete", done: true });
    const rechecking = protoReducer(complete, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    expect(getBaseCardContext(rechecking)).toMatchObject({ lifecycle: "loading", done: false });
    expect(protoReducer(rechecking, { type: "check-prerequisites" }).baseCardContext.lifecycle).toBe("blocked");
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
      expect(protoReducer(missingRepo, { type: "check-prerequisites" }).baseCardContext).toMatchObject({ title: "Custom title", lifecycle: "blocked" });
    }
  });

  it.each(["action", "commit"] as const)("allows loading to transition to %s only with prerequisites met", (lifecycle) => {
    const entered = protoReducer(initialState, { type: "transition", lifecycle });
    expect(entered.baseCardContext.lifecycle).toBe(lifecycle);
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
      cardId: "proto_card",
      status: "loading",
      shared: { title: "Context title", status: "loading" },
      appContext: appStore.getSnapshot(),
      summary: "Checking prerequisites...",
      done: false,
      baseCardContext: { ...getBaseCardContext(state), title: "Context title" },
      protoCardContext: state.protoCardContext,
      dispatch: vi.fn(),
    };
    try {
      await act(async () => root.render(
        <ThemeProvider theme={theme}>
          <ProtoCard
            protoCard={protoCard}
            cardChrome={{
              cardId: "github_login",
              status: "loading",
              summary: "Legacy summary",
              locked: false,
              requirements: [],
              unavailable: false,
              expanded: true,
              onToggle: () => { },
              onRequirementClick: () => { },
            }}
          />
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
    const dispatch = vi.fn();
    const protoCard: UseProtoCard = {
      cardId: "proto_card",
      status: "idle",
      shared: { title: state.baseCardContext.title, status: "blocked" },
      appContext: appStore.getSnapshot(),
      done: false,
      baseCardContext: getBaseCardContext(state),
      protoCardContext: state.protoCardContext,
      dispatch,
    };
    try {
      await act(async () => root.render(
        <ThemeProvider theme={theme}>
          <ProtoCard
            protoCard={protoCard}
            cardChrome={{
              cardId: "proto_card",
              status: "idle",
              locked: false,
              requirements: [],
              unavailable: false,
              expanded: true,
              onToggle: () => { },
              onRequirementClick: () => { },
            }}
          />
        </ThemeProvider>
      ));
      expect(container.textContent).toContain("repo_v2");
      expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).not.toBeNull();
      await act(async () => unlock?.click());
      expect(dispatch).toHaveBeenCalledWith({ type: "force-unlock", value: true });
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
      await act(async () => latest?.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo_v2" }));
      await act(async () => vi.advanceTimersByTime(1999));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(1));
      expect(latest?.baseCardContext.lifecycle).toBe("blocked");
      await act(async () => latest?.dispatch({ type: "card-prerequisite", index: 0, cardId: "" }));
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
          <ProtoCard protoCard={latest} cardChrome={{
            cardId: "proto_card", status: latest.status, locked: false, requirements: [],
            unavailable: false, expanded: true, onToggle: () => { }, onRequirementClick: () => { },
          }} />
        </ThemeProvider>
      );
    }
    async function setInput(index: number, value: string, commit: "blur" | "enter" = "blur") {
      const input = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[index];
      expect(input).toBeDefined();
      await act(async () => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(document.activeElement).toBe(input);
      expect(latest?.baseCardContext.lifecycle).not.toBe("loading");
      await act(async () => {
        if (commit === "enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        else input.blur();
      });
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      expect(container.querySelector("#proto-card-prerequisites")).toBeNull();
      expect(container.querySelectorAll('input[type="text"]')).toHaveLength(0);
    }
    async function openPrerequisites() {
      const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-prerequisites"]');
      expect(toggle).not.toBeNull();
      if (toggle?.getAttribute("aria-expanded") === "false") await act(async () => toggle.click());
    }
    try {
      store.update("github_login_v2", { title: "Login", status: "complete" });
      store.update("repo_v2", { title: "Repository", status: "ready" });
      store.update("proto_card", { title: "ProtoCard", status: "complete" });
      await act(async () => root.render(<Harness />));
      await act(async () => vi.advanceTimersByTime(2000));
      const panel = container.querySelector("#proto-card-prerequisites")!;
      expect(container.querySelectorAll('input[type="text"]')).toHaveLength(2);
      expect(panel.querySelectorAll('input[type="text"]')).toHaveLength(2);
      expect(panel.querySelector('input[type="checkbox"]')).toBeNull();
      expect([...panel.querySelectorAll("button")].find((button) => button.textContent === "Block")).toBeUndefined();
      const firstInput = panel.querySelector<HTMLInputElement>('input[type="text"]')!;
      await act(async () => { firstInput.focus(); firstInput.blur(); });
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      await act(async () => {
        firstInput.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(firstInput, "github");
        firstInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      expect(document.activeElement).toBe(firstInput);
      await setInput(0, "github_login_v2", "enter");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      await setInput(1, "repo_v2");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext).toMatchObject({ lifecycle: "blocked", unmetCardPrerequisites: ["repo_v2"] });
      expect(container.textContent).toContain("repo_v2");
      await act(async () => store.update("repo_v2", { title: "Repository", status: "complete" }));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      await act(async () => {
        latest?.dispatch({ type: "transition", lifecycle: "action" });
        latest?.dispatch({ type: "transition", lifecycle: "commit" });
        latest?.dispatch({ type: "transition", lifecycle: "complete" });
      });
      expect(latest?.done).toBe(true);
      await act(async () => store.update("github_login_v2", { title: "Login", status: "error" }));
      expect(latest?.done).toBe(false);
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext).toMatchObject({ lifecycle: "blocked", unmetCardPrerequisites: ["github_login_v2"] });
      expect(container.querySelectorAll('input[type="text"]')).toHaveLength(0);
      await act(async () => container.querySelector<HTMLButtonElement>("button.MuiLink-root")?.click());
      await openPrerequisites();
      await setInput(0, "unknown_card");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext).toMatchObject({ lifecycle: "blocked", unmetCardPrerequisites: ["unknown_card"] });
      await openPrerequisites();
      await setInput(0, "proto_card");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.unmetCardPrerequisites).toEqual(["proto_card"]);
      await openPrerequisites();
      await setInput(0, "");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
    } finally {
      await act(async () => latest?.dispatch({ type: "force-unlock", value: false }));
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
      await act(async () => latest?.dispatch({ type: "transition", lifecycle }));
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
    const onRequirementClick = vi.fn();
    const onToggle = vi.fn();
    let latest: UseProtoCard | undefined;

    function Harness() {
      const protoCard = useProtoCard(appStore);
      latest = protoCard;
      return (
        <ThemeProvider theme={theme}>
          <ProtoCard
            protoCard={protoCard}
            cardChrome={{
              cardId: "proto_card",
              status: protoCard.status,
              summary: protoCard.summary,
              locked: true,
              requirements: [{ label: "Legacy prerequisite", target: "github_login" }],
              unavailable: protoCard.status === "unavailable",
              expanded: true,
              onToggle,
              onRequirementClick,
            }}
          />
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
      expect(latest?.cardId).toBe(latest?.baseCardContext.cardId);
      expect(latest?.summary).toBe(latest?.baseCardContext.summary);
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Ready");
      expect(container.textContent).not.toContain("Legacy prerequisite");
      const diagram = container.querySelector('[aria-label="Lifecycle diagram"]');
      expect(diagram).not.toBeNull();
      const states: CardLifecycle[] = ["loading", "blocked", "ready", "action", "commit", "complete", "error"];
      const expectedEdges = states.flatMap((from) => states
        .filter((to) => canCardTransition({ lifecycle: from }, to))
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
        appStore.update("repo_v2", { title: "Repository 2", status: "ready" });
        appStore.update("github_login_v2", {
          title: "GitHub login 2", status: "complete", githubAccount: { login: "test-user" },
          githubToken: new SensitiveToken("test-secret"), githubMode: "direct",
        });
      });
      await act(async () => resultsToggle?.click());
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("true");
      for (const name of ["protoCardContext", "baseCardContext", "appContext"] as const) {
        const yaml = container.querySelector(`[aria-label="${name} YAML"] pre`)?.textContent;
        expect(yaml).toBeDefined();
        const expected = name === "appContext" ? JSON.parse(JSON.stringify(latest?.appContext)) : latest?.[name];
        expect(parse(yaml!)).toEqual(expected);
      }
      let appYaml = container.querySelector('[aria-label="appContext YAML"] pre')?.textContent;
      expect(container.querySelector('[aria-label="appContext YAML"] pre')?.getAttribute("data-sensitive")).toBe("true");
      expect(appYaml).not.toContain("test-secret");
      expect(parse(appYaml!).cards.repo_v2.status).toBe("ready");
      await act(async () => appStore.update("repo_v2", { title: "Repository 2", status: "complete" }));
      appYaml = container.querySelector('[aria-label="appContext YAML"] pre')?.textContent;
      expect(parse(appYaml!).cards.repo_v2.status).toBe("complete");
      const separator = container.querySelector<HTMLDivElement>('[aria-label="Resize protoCardContext column"]');
      expect(separator?.getAttribute("aria-valuenow")).toBe("33");
      await act(async () => separator?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
      expect(separator?.getAttribute("aria-valuenow")).toBe("35");
      await act(async () => prerequisitesToggle?.click());
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("true");
      await openPrerequisites();
      await act(async () => container.querySelector<HTMLButtonElement>("#card-title-proto_card button")?.click());
      expect(onToggle).toHaveBeenCalledOnce();
      await act(async () => {
        latest?.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo_v2" });
        appStore.update("repo_v2", { title: "Repository 2", status: "ready" });
      });
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Blocked: repo_v2");
      expect(latest?.summary).toBe(latest?.baseCardContext.summary);
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Blocked");
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect(container.textContent).toContain("The following prerequisites are incomplete");
      const content = container.querySelector("#card-content-proto_card");
      expect(content?.textContent?.match(/The ProtoCard is a prototype card/g)).toHaveLength(1);
      expect(content?.textContent).not.toContain("Simulated app state");
      expect(content?.textContent).not.toContain("Lifecycle:");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Loading")).toBeUndefined();
      expect(container.textContent).toContain("repo_v2");
      expect(onRequirementClick).not.toHaveBeenCalled();
      const firstUnlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(firstUnlock).not.toBeNull();
      await act(async () => firstUnlock?.click());
      expect(container.querySelector('[aria-controls="proto-card-prerequisites"]')?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector('[aria-controls="proto-card-results"]')?.getAttribute("aria-expanded")).toBe("false");
      await openPrerequisites();
      expect(latest?.protoCardContext.forceUnlocked).toBe(true);
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect(container.textContent).toContain("Lifecycle: blocked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      expect(container.querySelector('[aria-label="Lifecycle diagram"] [aria-current="step"]')?.textContent).toBe("Blocked");
      expect(latest?.baseCardContext.unmetCardPrerequisites).toEqual(["repo_v2"]);
      const complete = [...container.querySelectorAll("button")].find((button) => button.textContent === "Complete");
      expect(complete).toBeDefined();
      expect(complete?.disabled).toBe(true);
      await act(async () => appStore.update("repo_v2", { title: "Repository 2", status: "complete" }));
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
      expect(latest?.status).toBe("warning");
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
      expect(latest?.status).toBe("warning");
      const baseYaml = container.querySelector('[aria-label="baseCardContext YAML"] pre')?.textContent;
      expect(parse(baseYaml!)).toEqual(latest?.baseCardContext);
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
      await act(async () => latest?.dispatch({ type: "transition", lifecycle: "error" }));
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
        latest?.dispatch({ type: "force-unlock", value: false });
        appStore.update("repo_v2", { title: "Repository 2", status: "ready" });
      });
      expect(latest?.protoCardContext.forceUnlocked).toBe(false);
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
      await act(async () => latest?.dispatch({ type: "force-unlock", value: false }));
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
      expect(latest?.protoCardContext.forceUnlocked).toBe(true);
      await act(async () => vi.advanceTimersByTime(2000));
      await act(async () => latest?.dispatch({ type: "card-prerequisite", index: 0, cardId: "repo_v2" }));
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });
});
