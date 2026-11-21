/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import theme from "../../theme";
import ProtoCard from "./ProtoCard";
import { useProtoCard, type UseProtoCard } from "./useProtoCard";
import { getCardContext, initialState, protoReducer } from "./stateMachine";

describe("ProtoCard state machine", () => {
  it("prioritizes configuration, guards transitions, and preserves lifecycle while locked", () => {
    const loading = protoReducer(initialState, { type: "transition", lifecycle: "loading" });
    const locked = protoReducer(loading, { type: "requirement", id: "repo", completed: false });
    expect(getCardContext(locked)).toMatchObject({ availability: "locked", unmetRequirements: ["repo"], status: "idle" });
    expect(() => protoReducer(locked, { type: "transition", lifecycle: "complete" })).toThrow();
    const forced = protoReducer(locked, { type: "force-unlock", value: true });
    expect(forced.protoCardContext.forceUnlocked).toBe(true);
    expect(forced.cardContext.lifecycle).toBe("loading");
    expect(forced.appContext.completed.repo).toBe(false);
    expect(() => protoReducer(forced, { type: "transition", lifecycle: "complete" })).toThrow();

    const unavailable = protoReducer(locked, { type: "configuration", configured: false });
    expect(getCardContext(unavailable)).toMatchObject({ availability: "unavailable", status: "unavailable" });
    const restored = protoReducer(unavailable, { type: "configuration", configured: true });
    expect(getCardContext(restored).availability).toBe("locked");
    const available = protoReducer(restored, { type: "requirement", id: "repo", completed: true });
    const complete = protoReducer(available, { type: "transition", lifecycle: "complete" });
    expect(getCardContext(complete)).toMatchObject({ availability: "available", status: "complete", done: true });
    expect(getCardContext(protoReducer(complete, { type: "requirement", id: "repo", completed: false })).done).toBe(false);
    expect(() => protoReducer(initialState, { type: "transition", lifecycle: "complete" })).toThrow();
    const afterTransition = protoReducer(protoReducer(initialState, { type: "force-unlock", value: true }), { type: "transition", lifecycle: "loading" });
    expect(afterTransition.protoCardContext.forceUnlocked).toBe(true);
    expect(afterTransition.cardContext.lifecycle).toBe("loading");
  });

  it("force-unlocks the prototype without satisfying its prerequisites", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root = createRoot(container);
    const onRequirementClick = vi.fn();
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
              locked: false,
              requirements: [],
              unavailable: protoCard.status === "unavailable",
              expanded: true,
              onToggle: () => {},
              onRequirementClick,
            }}
          />
        </ThemeProvider>
      );
    }

    try {
      await act(async () => root.render(<Harness />));
      const repo = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Repository and environment"))?.querySelector("input");
      expect(repo).toBeDefined();
      expect(container.textContent).toContain("Availability: available");
      expect(container.textContent).toContain("lifecycle: blocked");
      await act(async () => repo?.click());
      expect(container.textContent).toContain("Locked: Repository and environment");
      expect(container.textContent).toContain("The following links will take you to the cards to complete first");
      const content = container.querySelector("#card-content-proto_card");
      expect(content?.textContent?.match(/Intro for this card\./g)).toHaveLength(1);
      expect(content?.textContent).not.toContain("Simulated app state");
      expect(content?.textContent).not.toContain("lifecycle:");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Start / retry")).toBeUndefined();
      const requirement = [...container.querySelectorAll("button")].find((button) => button.textContent === "Repository and environment");
      expect(requirement).toBeDefined();
      await act(async () => requirement?.click());
      expect(onRequirementClick).toHaveBeenCalledWith("repo");
      const firstUnlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(firstUnlock).not.toBeNull();
      await act(async () => firstUnlock?.click());
      expect(latest?.protoCardContext.forceUnlocked).toBe(true);
      expect(container.textContent).toContain("Availability: locked");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      const repoAfterUnlock = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Repository and environment"))?.querySelector("input");
      expect(repoAfterUnlock?.checked).toBe(false);
      const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "Start / retry");
      expect(start).toBeDefined();
      expect(start?.disabled).toBe(true);
      await act(async () => repoAfterUnlock?.click());
      expect(container.textContent).toContain("Availability: available");
      expect(container.textContent).not.toContain("This card is force-unlocked;");
      expect(start?.disabled).toBe(false);
      await act(async () => start?.click());
      expect(container.textContent).toContain("lifecycle: loading");
      const lock = [...container.querySelectorAll("button")].find((button) => button.textContent === "Lock");
      expect(lock).toBeDefined();
      await act(async () => lock?.click());
      expect(latest?.protoCardContext.forceUnlocked).toBe(false);
      expect(container.textContent).toContain("Locked: Repository and environment");
      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).not.toBeNull();
      await act(async () => unlock?.click());
      expect(container.textContent).toContain("Availability: locked");
      expect(container.textContent).toContain("lifecycle: loading");
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
      const configuration = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Configuration available"))?.querySelector("input");
      expect(configuration).toBeDefined();
      await act(async () => configuration?.click());
      expect(container.textContent).toContain("Availability: unavailable");

      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => root.render(<Harness />));
      expect(latest?.protoCardContext.forceUnlocked).toBe(true);
      const restoredRepo = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Repository and environment"))?.querySelector("input");
      expect(restoredRepo).toBeDefined();
      await act(async () => restoredRepo?.click());
      expect(container.textContent).toContain("This card is force-unlocked; its prerequisites are still incomplete.");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
