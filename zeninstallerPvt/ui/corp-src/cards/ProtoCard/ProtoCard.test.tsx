/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import { canCardTransition, type CardLifecycle } from "../../components/cardLifecycle";
import theme from "../../theme";
import ProtoCard from "./ProtoCard";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";
import { getBaseCardContext, initialState, protoReducer } from "./stateMachine";

describe("ProtoCard state machine", () => {
  it("checks prerequisites before entering ready or blocked and guards operations", () => {
    expect(initialState.baseCardContext.lifecycle).toBe("loading");
    expect(() => protoReducer(initialState, { type: "transition", lifecycle: "complete" })).toThrow();
    const ready = protoReducer(initialState, { type: "check-prerequisites" });
    expect(getBaseCardContext(ready)).toMatchObject({ lifecycle: "ready", availability: "available", status: "warning" });
    const checking = protoReducer(ready, { type: "requirement", id: "repo", completed: false });
    expect(getBaseCardContext(checking)).toMatchObject({ lifecycle: "loading", status: "loading" });
    const locked = protoReducer(checking, { type: "check-prerequisites" });
    expect(getBaseCardContext(locked)).toMatchObject({ lifecycle: "blocked", availability: "locked", unmetRequirements: ["repo"], status: "idle" });
    expect(() => protoReducer(locked, { type: "transition", lifecycle: "complete" })).toThrow();
    const forced = protoReducer(locked, { type: "force-unlock", value: true });
    expect(forced.protoCardContext.forceUnlocked).toBe(true);
    expect(forced.baseCardContext.lifecycle).toBe("blocked");
    expect(forced.appContext.completed.repo).toBe(false);
    expect(() => protoReducer(forced, { type: "transition", lifecycle: "complete" })).toThrow();

    const unavailable = protoReducer(protoReducer(locked, { type: "configuration", configured: false }), { type: "check-prerequisites" });
    expect(getBaseCardContext(unavailable)).toMatchObject({ lifecycle: "blocked", availability: "unavailable", status: "unavailable" });
    const restored = protoReducer(protoReducer(unavailable, { type: "configuration", configured: true }), { type: "check-prerequisites" });
    expect(getBaseCardContext(restored).availability).toBe("locked");
    const available = protoReducer(protoReducer(restored, { type: "requirement", id: "repo", completed: true }), { type: "check-prerequisites" });
    const complete = protoReducer(available, { type: "transition", lifecycle: "complete" });
    expect(getBaseCardContext(complete)).toMatchObject({ availability: "available", status: "complete", done: true });
    const rechecking = protoReducer(complete, { type: "requirement", id: "repo", completed: false });
    expect(getBaseCardContext(rechecking)).toMatchObject({ lifecycle: "loading", done: false });
    expect(protoReducer(rechecking, { type: "check-prerequisites" }).baseCardContext.lifecycle).toBe("blocked");
    expect(protoReducer(ready, { type: "check-prerequisites" })).toBe(ready);
  });

  it("shows a loading layout instead of locked or interactive content while checking", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const state = protoReducer(initialState, { type: "requirement", id: "repo", completed: false });
    const protoCard: UseProtoCard = {
      cardId: "proto_card",
      status: "loading",
      summary: "Checking prerequisites...",
      done: false,
      appContext: state.appContext,
      baseCardContext: getBaseCardContext(state),
      protoCardContext: state.protoCardContext,
      dispatch: vi.fn(),
    };
    try {
      await act(async () => root.render(
        <ThemeProvider theme={theme}>
          <ProtoCard
            protoCard={protoCard}
            card={{
              cardId: "proto_card",
              status: "loading",
              summary: protoCard.summary,
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

  it("restarts the loading delay when prerequisites change and cancels it on unmount", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    let latest: UseProtoCard | undefined;
    function Harness() {
      latest = useProtoCard();
      return null;
    }

    try {
      await act(async () => root.render(<Harness />));
      await act(async () => vi.advanceTimersByTime(1500));
      await act(async () => latest?.dispatch({ type: "requirement", id: "repo", completed: false }));
      await act(async () => vi.advanceTimersByTime(1999));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(1));
      expect(latest?.baseCardContext.lifecycle).toBe("blocked");
      await act(async () => latest?.dispatch({ type: "requirement", id: "repo", completed: true }));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => root.unmount());
      expect(vi.getTimerCount()).toBe(0);
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
      const protoCard = useProtoCard();
      latest = protoCard;
      return (
        <ThemeProvider theme={theme}>
          <ProtoCard
            protoCard={protoCard}
            card={{
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

    try {
      await act(async () => root.render(<Harness />));
      expect(container.textContent).toContain("Loading...");
      await act(async () => vi.advanceTimersByTime(1999));
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(1));
      const repo = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Repository and environment"))?.querySelector("input");
      expect(repo).toBeDefined();
      expect(container.textContent).toContain("Availability: available");
      expect(container.textContent).toContain("lifecycle: ready");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Ready");
      expect(container.textContent).not.toContain("Legacy prerequisite");
      const diagram = container.querySelector('[aria-label="Lifecycle diagram"]');
      expect(diagram).not.toBeNull();
      const states: CardLifecycle[] = ["loading", "blocked", "ready", "complete", "error"];
      const expectedEdges = states.flatMap((from) => states
        .filter((to) => canCardTransition({ lifecycle: from }, to))
        .map((to) => `${from}-${to}`));
      const displayedEdges = [...diagram!.querySelectorAll("[data-from][data-to]")]
        .map((edge) => `${edge.getAttribute("data-from")}-${edge.getAttribute("data-to")}`);
      expect(displayedEdges.sort()).toEqual(expectedEdges.sort());
      expect(diagram?.querySelector('[aria-current="step"]')?.textContent).toBe("Ready");
      const prerequisitesToggle = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-prerequisites"]');
      const resultsToggle = container.querySelector<HTMLButtonElement>('[aria-controls="proto-card-results"]');
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("false");
      await act(async () => prerequisitesToggle?.click());
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("true");
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector("#proto-card-prerequisites")?.textContent).toBe("");
      await act(async () => resultsToggle?.click());
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("#proto-card-results")?.textContent).toBe("");
      await act(async () => prerequisitesToggle?.click());
      expect(prerequisitesToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(resultsToggle?.getAttribute("aria-expanded")).toBe("true");
      await act(async () => container.querySelector<HTMLButtonElement>("#card-title-proto_card button")?.click());
      expect(onToggle).toHaveBeenCalledOnce();
      await act(async () => repo?.click());
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Locked: Repository and environment");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Locked");
      expect(container.querySelector('[data-testid="BlockIcon"]')).not.toBeNull();
      expect(container.textContent).toContain("The following links will take you to the cards to complete first");
      const content = container.querySelector("#card-content-proto_card");
      expect(content?.textContent?.match(/The ProtoCard is a prototype card/g)).toHaveLength(1);
      expect(content?.textContent).not.toContain("Simulated app state");
      expect(content?.textContent).not.toContain("lifecycle:");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Loading")).toBeUndefined();
      const requirement = [...container.querySelectorAll("button")].find((button) => button.textContent === "Repository and environment");
      expect(requirement).toBeDefined();
      await act(async () => requirement?.click());
      expect(onRequirementClick).toHaveBeenCalledWith("repo");
      const firstUnlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(firstUnlock).not.toBeNull();
      await act(async () => firstUnlock?.click());
      expect(latest?.protoCardContext.forceUnlocked).toBe(true);
      expect(container.querySelector('[data-testid="BlockIcon"]')).toBeNull();
      expect(container.textContent).toContain("Availability: locked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      expect(container.querySelector('[aria-label="Lifecycle diagram"] [aria-current="step"]')?.textContent).toBe("Blocked");
      const repoAfterUnlock = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Repository and environment"))?.querySelector("input");
      expect(repoAfterUnlock?.checked).toBe(false);
      const complete = [...container.querySelectorAll("button")].find((button) => button.textContent === "Complete");
      expect(complete).toBeDefined();
      expect(complete?.disabled).toBe(true);
      await act(async () => repoAfterUnlock?.click());
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Availability: available");
      expect(container.textContent).not.toContain("This card is force-unlocked;");
      const readyComplete = [...container.querySelectorAll("button")].find((button) => button.textContent === "Complete");
      expect(readyComplete?.disabled).toBe(false);
      await act(async () => readyComplete?.click());
      expect(container.textContent).toContain("lifecycle: complete");
      expect(container.querySelector('[aria-label="Lifecycle diagram"] [aria-current="step"]')?.textContent).toBe("Complete");
      const reload = [...container.querySelectorAll("button")].find((button) => button.textContent === "Loading");
      expect(reload?.disabled).toBe(false);
      await act(async () => reload?.click());
      expect(latest?.baseCardContext.lifecycle).toBe("loading");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("lifecycle: ready");
      const lock = [...container.querySelectorAll("button")].find((button) => button.textContent === "Lock");
      expect(lock).toBeDefined();
      await act(async () => lock?.click());
      expect(latest?.protoCardContext.forceUnlocked).toBe(false);
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Locked: Repository and environment");
      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).not.toBeNull();
      await act(async () => unlock?.click());
      expect(container.textContent).toContain("Availability: locked");
      expect(container.textContent).toContain("lifecycle: blocked");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Locked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      const configuration = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Configuration available"))?.querySelector("input");
      expect(configuration).toBeDefined();
      await act(async () => configuration?.click());
      await act(async () => vi.advanceTimersByTime(2000));
      expect(container.textContent).toContain("Availability: unavailable");
      expect(container.querySelector(".visually-hidden")?.textContent).toBe("Unavailable");
      expect(container.querySelector('[data-testid="WarningAmberIcon"]')).not.toBeNull();

      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => root.render(<Harness />));
      expect(latest?.protoCardContext.forceUnlocked).toBe(true);
      await act(async () => vi.advanceTimersByTime(2000));
      const restoredRepo = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Repository and environment"))?.querySelector("input");
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
