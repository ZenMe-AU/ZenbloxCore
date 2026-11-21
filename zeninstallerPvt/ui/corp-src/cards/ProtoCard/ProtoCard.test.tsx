/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { canCardTransition, type CardLifecycle } from "../../components/cardLifecycle";
import { createSharedContext } from "../../sharedContext";
import theme from "../../theme";
import ProtoCard from "./ProtoCard";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";
import { getBaseCardContext, initialState, protoReducer } from "./stateMachine";

describe("ProtoCard state machine", () => {
  const sharedStore = createSharedContext();
  it("checks prerequisites before entering ready or blocked and guards operations", () => {
    expect(initialState.baseCardContext.lifecycle).toBe("loading");
    expect(() => protoReducer(initialState, { type: "transition", lifecycle: "complete" })).toThrow();
    const ready = protoReducer(initialState, { type: "check-prerequisites" });
    expect(getBaseCardContext(ready)).toMatchObject({ cardId: "proto_card", summary: "Summary", lifecycle: "ready", unmetRequirements: [] });
    const checking = protoReducer(ready, { type: "requirement", id: "xxx", completed: false });
    expect(getBaseCardContext(checking)).toMatchObject({ lifecycle: "loading", unmetRequirements: ["xxx"] });
    const blocked = protoReducer(checking, { type: "check-prerequisites" });
    expect(getBaseCardContext(blocked)).toMatchObject({ lifecycle: "blocked", summary: "Blocked: requirement xxx", unmetRequirements: ["xxx"] });
    expect(() => protoReducer(blocked, { type: "transition", lifecycle: "complete" })).toThrow();
    const forced = protoReducer(blocked, { type: "force-unlock", value: true });
    expect(forced.protoCardContext.forceUnlocked).toBe(true);
    expect(forced.baseCardContext.lifecycle).toBe("blocked");
    expect(forced.appContext.completed.xxx).toBe(false);
    expect(() => protoReducer(forced, { type: "transition", lifecycle: "complete" })).toThrow();

    const missingConfig = protoReducer(protoReducer(ready, { type: "configuration", configured: false }), { type: "check-prerequisites" });
    expect(getBaseCardContext(missingConfig).summary).toBe("Configuration unavailable");
    const forcedMissingConfig = protoReducer(missingConfig, { type: "force-unlock", value: true });
    expect(forcedMissingConfig.baseCardContext.lifecycle).toBe("blocked");
    expect(() => protoReducer(forcedMissingConfig, { type: "transition", lifecycle: "complete" })).toThrow();

    const unavailable = protoReducer(protoReducer(blocked, { type: "configuration", configured: false }), { type: "check-prerequisites" });
    expect(getBaseCardContext(unavailable)).toMatchObject({ lifecycle: "blocked", unmetRequirements: ["xxx"] });
    const restored = protoReducer(protoReducer(unavailable, { type: "configuration", configured: true }), { type: "check-prerequisites" });
    expect(getBaseCardContext(restored).lifecycle).toBe("blocked");
    const available = protoReducer(protoReducer(restored, { type: "requirement", id: "xxx", completed: true }), { type: "check-prerequisites" });
    const action = protoReducer(available, { type: "transition", lifecycle: "action" });
    const commit = protoReducer(action, { type: "transition", lifecycle: "commit" });
    const complete = protoReducer(commit, { type: "transition", lifecycle: "complete" });
    expect(getBaseCardContext(complete)).toMatchObject({ lifecycle: "complete", done: true });
    const rechecking = protoReducer(complete, { type: "requirement", id: "xxx", completed: false });
    expect(getBaseCardContext(rechecking)).toMatchObject({ lifecycle: "loading", done: false });
    expect(protoReducer(rechecking, { type: "check-prerequisites" }).baseCardContext.lifecycle).toBe("blocked");
    expect(protoReducer(ready, { type: "check-prerequisites" })).toBe(ready);
  });

  it("resets the lifecycle when simulated prerequisites change", () => {
    const customized = { ...initialState, baseCardContext: { ...initialState.baseCardContext, title: "Custom title" } };
    const ready = protoReducer(customized, { type: "check-prerequisites" });
    const action = protoReducer(ready, { type: "transition", lifecycle: "action" });
    const commit = protoReducer(action, { type: "transition", lifecycle: "commit" });
    for (const state of [ready, action, commit]) {
      expect(() => protoReducer(state, { type: "transition", lifecycle: "loading" })).toThrow();
      const missingRepo = protoReducer(state, { type: "requirement", id: "xxx", completed: false });
      expect(getBaseCardContext(missingRepo)).toMatchObject({ title: "Custom title", lifecycle: "loading", unmetRequirements: ["xxx"] });
      expect(protoReducer(missingRepo, { type: "check-prerequisites" }).baseCardContext).toMatchObject({ title: "Custom title", lifecycle: "blocked" });
      const missingConfig = protoReducer(state, { type: "configuration", configured: false });
      expect(missingConfig.baseCardContext).toMatchObject({ title: "Custom title", lifecycle: "loading" });
      expect(protoReducer(missingConfig, { type: "check-prerequisites" }).baseCardContext).toMatchObject({ title: "Custom title", lifecycle: "blocked" });
    }
  });

  it.each(["action", "commit"] as const)("allows loading to transition to %s only with prerequisites met", (lifecycle) => {
    const entered = protoReducer(initialState, { type: "transition", lifecycle });
    expect(entered.baseCardContext.lifecycle).toBe(lifecycle);
    expect(protoReducer(entered, { type: "check-prerequisites" })).toBe(entered);
    const missingRepo = protoReducer(initialState, { type: "requirement", id: "xxx", completed: false });
    const missingConfig = protoReducer(initialState, { type: "configuration", configured: false });
    for (const state of [missingRepo, missingConfig]) {
      expect(() => protoReducer(state, { type: "transition", lifecycle })).toThrow();
    }
  });

  it("shows a loading layout instead of blocked or interactive content while checking", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const state = protoReducer(initialState, { type: "requirement", id: "xxx", completed: false });
    const protoCard: UseProtoCard = {
      cardId: "proto_card",
      status: "loading",
      shared: { title: "Context title", status: "loading" },
      sharedContext: sharedStore.getSnapshot(),
      summary: "Checking prerequisites...",
      done: false,
      appContext: state.appContext,
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
              onToggle: () => {},
              onRequirementClick: () => {},
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

  it("offers force unlock when configuration alone blocks the card", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const state = protoReducer(protoReducer(initialState, { type: "configuration", configured: false }), { type: "check-prerequisites" });
    const dispatch = vi.fn();
    const protoCard: UseProtoCard = {
      cardId: "proto_card",
      status: "unavailable",
      shared: { title: state.baseCardContext.title, status: "blocked" },
      sharedContext: sharedStore.getSnapshot(),
      done: false,
      appContext: state.appContext,
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
              status: "unavailable",
              locked: false,
              requirements: [],
              unavailable: true,
              expanded: true,
              onToggle: () => {},
              onRequirementClick: () => {},
            }}
          />
        </ThemeProvider>
      ));
      expect(container.textContent).toContain("The simulated configuration is unavailable.");
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
      latest = useProtoCard(sharedStore);
      return null;
    }

    try {
      await act(async () => root.render(<Harness />));
      await act(async () => vi.advanceTimersByTime(1500));
      await act(async () => latest?.dispatch({ type: "requirement", id: "xxx", completed: false }));
      await act(async () => vi.advanceTimersByTime(1999));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(1));
      expect(latest?.baseCardContext.lifecycle).toBe("blocked");
      await act(async () => latest?.dispatch({ type: "requirement", id: "xxx", completed: true }));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => root.unmount());
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });

  it.each(["action", "commit"] as const)("cancels the loading check after transitioning to %s", async (lifecycle) => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    let latest: UseProtoCard | undefined;
    function Harness() {
      latest = useProtoCard(sharedStore);
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
      const protoCard = useProtoCard(sharedStore);
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
      const repo = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("requirement xxx"))?.querySelector("input");
      expect(repo).toBeDefined();
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
      await act(async () => resultsToggle?.click());
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("true");
      for (const name of ["protoCardContext", "baseCardContext", "appContext"] as const) {
        const yaml = container.querySelector(`[aria-label="${name} YAML"] pre`)?.textContent;
        expect(yaml).toBeDefined();
        expect(parse(yaml!)).toEqual(latest?.[name]);
      }
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
      await act(async () => repo?.click());
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Blocked: requirement xxx");
      expect(latest?.summary).toBe(latest?.baseCardContext.summary);
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Blocked");
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect(container.textContent).toContain("The following simulated prerequisites are incomplete");
      const content = container.querySelector("#card-content-proto_card");
      expect(content?.textContent?.match(/The ProtoCard is a prototype card/g)).toHaveLength(1);
      expect(content?.textContent).not.toContain("Simulated app state");
      expect(content?.textContent).not.toContain("Lifecycle:");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Loading")).toBeUndefined();
      expect(container.textContent).toContain("requirement xxx");
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
      const repoAfterUnlock = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("requirement xxx"))?.querySelector("input");
      expect(repoAfterUnlock?.checked).toBe(false);
      const complete = [...container.querySelectorAll("button")].find((button) => button.textContent === "Complete");
      expect(complete).toBeDefined();
      expect(complete?.disabled).toBe(true);
      await act(async () => repoAfterUnlock?.click());
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
      const block = [...container.querySelectorAll("button")].find((button) => button.textContent === "Block");
      expect(block).toBeDefined();
      await act(async () => block?.click());
      expect(latest?.protoCardContext.forceUnlocked).toBe(false);
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Blocked: requirement xxx");
      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).not.toBeNull();
      await act(async () => unlock?.click());
      await openPrerequisites();
      expect(container.textContent).toContain("Lifecycle: blocked");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Blocked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      const configuration = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Configuration available"))?.querySelector("input");
      expect(configuration).toBeDefined();
      await act(async () => configuration?.click());
      await act(async () => vi.advanceTimersByTime(2000));
      await openPrerequisites();
      expect(container.textContent).toContain("its configuration is unavailable and its prerequisites are still incomplete.");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Blocked");
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect(latest?.status).toBe("unavailable");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Complete")?.disabled).toBe(true);
      await act(async () => latest?.dispatch({ type: "force-unlock", value: false }));
      expect(container.textContent).toContain("The simulated configuration is unavailable.");
      expect(container.querySelector('[aria-label="Lifecycle diagram"]')).toBeNull();
      expect([...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Configuration available"))).toBeUndefined();
      const forceUnavailable = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(forceUnavailable).not.toBeNull();
      await act(async () => forceUnavailable?.click());
      await openPrerequisites();
      expect(latest?.baseCardContext.lifecycle).toBe("blocked");
      expect(latest?.appContext.configured).toBe(false);
      expect(container.textContent).toContain("its configuration is unavailable and its prerequisites are still incomplete.");
      const restoreConfiguration = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Configuration available"))?.querySelector("input");
      expect(restoreConfiguration?.checked).toBe(false);
      await act(async () => restoreConfiguration?.click());
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Lifecycle: blocked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");

      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => root.render(<Harness />));
      expect(latest?.protoCardContext.forceUnlocked).toBe(true);
      await act(async () => vi.advanceTimersByTime(2000));
      await openPrerequisites();
      const restoredRepo = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("requirement xxx"))?.querySelector("input");
      expect(restoredRepo).toBeDefined();
      await act(async () => restoredRepo?.click());
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });
});
