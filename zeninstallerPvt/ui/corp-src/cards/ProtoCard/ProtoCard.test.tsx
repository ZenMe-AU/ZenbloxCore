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
import { useProtoCard } from "./useProtoCard";
import { getCardContext, initialState, protoReducer } from "./stateMachine";

describe("ProtoCard state machine", () => {
  it("prioritizes configuration, guards transitions, and preserves lifecycle while locked", () => {
    const loading = protoReducer(initialState, { type: "transition", lifecycle: "loading" });
    const locked = protoReducer(loading, { type: "requirement", id: "repo", completed: false });
    expect(getCardContext(locked)).toMatchObject({ availability: "locked", unmetRequirements: ["repo"], status: "idle" });
    expect(() => protoReducer(locked, { type: "transition", lifecycle: "complete" })).toThrow();

    const unavailable = protoReducer(locked, { type: "configuration", configured: false });
    expect(getCardContext(unavailable)).toMatchObject({ availability: "unavailable", status: "unavailable" });
    const restored = protoReducer(unavailable, { type: "configuration", configured: true });
    expect(getCardContext(restored).availability).toBe("locked");
    const available = protoReducer(restored, { type: "requirement", id: "repo", completed: true });
    const complete = protoReducer(available, { type: "transition", lifecycle: "complete" });
    expect(getCardContext(complete)).toMatchObject({ availability: "available", status: "complete", done: true });
    expect(getCardContext(protoReducer(complete, { type: "requirement", id: "repo", completed: false })).done).toBe(false);
    expect(() => protoReducer(initialState, { type: "transition", lifecycle: "complete" })).toThrow();
  });

  it("allows simulated prerequisites to lock and unlock the real card", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onRequirementClick = vi.fn();

    function Harness() {
      const protoCard = useProtoCard();
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
      await act(async () => repo?.click());
      expect(container.textContent).toContain("Locked: Repository and environment");
      expect(container.textContent).toContain("The following links will take you to the cards to complete.");
      const content = container.querySelector("#card-content-proto_card");
      expect(content?.textContent?.match(/Intro for this card\./g)).toHaveLength(1);
      expect(content?.textContent).not.toContain("Simulated app state");
      expect(content?.textContent).not.toContain("lifecycle:");
      expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Start / retry")).toBeUndefined();
      const requirement = [...container.querySelectorAll("button")].find((button) => button.textContent === "Repository and environment");
      expect(requirement).toBeDefined();
      await act(async () => requirement?.click());
      expect(onRequirementClick).toHaveBeenCalledWith("repo");
      const firstUnlock = [...container.querySelectorAll("button")].find((button) => button.textContent === "Unlock");
      expect(firstUnlock).toBeDefined();
      await act(async () => firstUnlock?.click());
      expect(container.textContent).toContain("Availability: available");
      const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "Start / retry");
      expect(start).toBeDefined();
      expect(start?.disabled).toBe(false);
      await act(async () => start?.click());
      expect(container.textContent).toContain("lifecycle: loading");
      const lock = [...container.querySelectorAll("button")].find((button) => button.textContent === "Lock");
      expect(lock).toBeDefined();
      await act(async () => lock?.click());
      expect(container.textContent).toContain("Locked: Repository and environment");
      const unlock = container.querySelector<HTMLButtonElement>("button.MuiLink-root");
      expect(unlock).toBeDefined();
      expect(unlock?.textContent).toBe("Unlock");
      await act(async () => unlock?.click());
      expect(container.textContent).toContain("Availability: available");
      expect(container.textContent).toContain("lifecycle: loading");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
