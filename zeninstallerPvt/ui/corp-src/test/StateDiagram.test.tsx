/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it } from "vitest";
import BaseCard from "../components/BaseCard";
import StateDiagram from "../components/StateDiagram";
import type { Lifecycle, StateGraph } from "../components/basecardlifecycle";
import theme from "../theme";

const graph = {
    loading: { label: "Loading", baseCardLifecycle: "loading", transitions: ["ready"] },
    ready: { label: "Ready", baseCardLifecycle: "ready", transitions: [] },
} as const satisfies StateGraph<"loading" | "ready", Lifecycle>;

it("renders the graph read-only and marks the current state", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        await act(async () => root.render(<StateDiagram graph={graph} currentState="ready" />));
        const diagram = container.querySelector("svg");
        expect(diagram?.getAttribute("aria-label")).toContain("Current state: Ready");
        expect(container.querySelectorAll("path[data-from][data-to]")).toHaveLength(1);
        expect(container.querySelector('[data-state="ready"]')?.getAttribute("aria-current")).toBe("true");
        expect(container.querySelectorAll("button, input, select, textarea")).toHaveLength(0);
    } finally {
        await act(async () => root.unmount());
    }
});

it("uses a supplied layout while keeping graph transitions as the rendered edges", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        await act(async () => root.render(
            <StateDiagram
                graph={graph}
                currentState="ready"
                layout={{
                    width: 500,
                    height: 260,
                    nodeWidth: 112,
                    nodeHeight: 40,
                    positions: { loading: { x: 90, y: 120 }, ready: { x: 410, y: 120 } },
                    edgePaths: [{ from: "loading", to: "ready", path: "M146 120 H354" }],
                }}
            />
        ));
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("width")).toBe("500");
        expect(svg?.getAttribute("height")).toBe("260");
        expect(container.querySelector("path[data-from='loading'][data-to='ready']")?.getAttribute("d")).toBe("M146 120 H354");
        expect(container.querySelector("rect[x='34']")).not.toBeNull();
    } finally {
        await act(async () => root.unmount());
    }
});

it("shows and hides the read-only diagram from the BaseCard context menu", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(
            <ThemeProvider theme={theme}>
                <BaseCard
                    baseCardContext={{ cardId: "proto_card", title: "Diagram test", lifecycle: "ready", prerequisiteIds: [] }}
                    expanded
                    onToggle={() => { }}
                    stateDiagram={{ graph, currentState: "ready" }}
                >
                    <p>Card content</p>
                </BaseCard>
            </ThemeProvider>
        ));
        const card = container.querySelector("#card-proto_card")!;
        await act(async () => card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 30, clientY: 40 })));
        const showItem = document.body.querySelector('[role="menuitemcheckbox"]');
        expect(showItem?.textContent).toContain("Show read-only state diagram");
        await act(async () => (showItem as HTMLElement)?.click());
        expect(container.querySelector("#card-content-proto_card svg")).not.toBeNull();
        expect(container.querySelector("#card-content-proto_card")?.firstElementChild?.querySelector("svg")).not.toBeNull();

        await act(async () => card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 30, clientY: 40 })));
        const hideItem = document.body.querySelector('[role="menuitemcheckbox"]');
        expect(hideItem?.textContent).toContain("Hide read-only state diagram");
        await act(async () => (hideItem as HTMLElement)?.click());
        expect(container.querySelector("#card-content-proto_card svg")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});