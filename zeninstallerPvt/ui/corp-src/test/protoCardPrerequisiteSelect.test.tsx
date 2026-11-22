/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it, vi } from "vitest";
import { createAppContext } from "../appContext";
import ProtoCard from "../cards/ProtoCard/ProtoCard";
import { getBaseCardContext, initialState, reducer } from "../cards/ProtoCard/stateMachine";
import type { UseProtoCard } from "../cards/ProtoCard/useProtoCard";
import theme from "../theme";

it("offers only registered prerequisite IDs and dispatches the selected ID", async () => {
    const store = createAppContext();
    store.update("github_login_v2", { title: "GitHub login 2", status: "complete" });
    store.update("repo_v2", { title: "Repository V2", status: "ready" });
    store.update("proto_card", { title: "ProtoCard prototype card", status: "ready" });
    const state = reducer(initialState, { type: "check-prerequisites" });
    const dispatch = vi.fn();
    const protoCard: UseProtoCard = {
        cardId: "proto_card",
        status: "warning",
        shared: { title: "ProtoCard prototype card", status: "ready" },
        summary: "Ready to proceed",
        done: false,
        appContext: store.getSnapshot(),
        baseCardContext: getBaseCardContext(state),
        privateContext: state.privateContext,
        dispatch,
    };
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
        await act(async () => root.render(
            <ThemeProvider theme={theme}>
                <ProtoCard
                    protoCard={protoCard}
                    cardChrome={{
                        cardId: "proto_card",
                        status: "warning",
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

        const selects = container.querySelectorAll<HTMLSelectElement>("select");
        expect(selects).toHaveLength(2);
        expect(container.querySelector(".MuiInputLabel-root")?.classList.contains("MuiInputLabel-shrink")).toBe(true);
        expect([...selects[0].options].map(({ value }) => value)).toEqual([
            "", "github_login_v2", "repo_v2",
        ]);
        expect([...selects[0].options].map(({ textContent }) => textContent)).toContain("Repository V2 (repo_v2)");

        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(selects[0], "repo_v2");
            selects[0].dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(dispatch).toHaveBeenCalledWith({ type: "card-prerequisite", index: 0, cardId: "repo_v2" });
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

it("links a failed registered prerequisite to its card", async () => {
    const store = createAppContext();
    store.update("github_login_v2", { title: "GitHub login 2", status: "complete" });
    store.update("repo_v2", { title: "Repository V2", status: "ready" });
    store.update("proto_card", { title: "ProtoCard prototype card", status: "ready" });
    const loading = reducer(initialState, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    const state = reducer(loading, { type: "check-prerequisites" });
    const protoCard: UseProtoCard = {
        cardId: "proto_card",
        status: "idle",
        shared: { title: "ProtoCard prototype card", status: "blocked" },
        summary: "Blocked due to incomplete prerequisites: repo_v2",
        done: false,
        appContext: store.getSnapshot(),
        baseCardContext: getBaseCardContext(state),
        privateContext: state.privateContext,
        dispatch: vi.fn(),
    };
    const onRequirementClick = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

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
                        onRequirementClick,
                    }}
                />
            </ThemeProvider>
        ));

        const repoLink = [...container.querySelectorAll<HTMLButtonElement>("button.MuiLink-root")]
            .find((button) => button.textContent?.includes("Repository V2 (repo_v2)"));
        expect(repoLink).toBeDefined();
        await act(async () => repoLink?.click());
        expect(onRequirementClick).toHaveBeenCalledWith("repo_v2");
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

it("undoes force-unlock when its status message is clicked", async () => {
    const store = createAppContext();
    store.update("repo_v2", { title: "Repository V2", status: "ready" });
    const blocked = reducer(
        reducer(initialState, { type: "sync-card-prerequisites", unmet: ["repo_v2"] }),
        { type: "check-prerequisites" },
    );
    const state = reducer(blocked, { type: "force-unlock", value: true });
    const dispatch = vi.fn();
    const protoCard: UseProtoCard = {
        cardId: "proto_card",
        status: "idle",
        shared: { title: "ProtoCard prototype card", status: "blocked" },
        summary: "Blocked due to incomplete prerequisites: repo_v2",
        done: false,
        appContext: store.getSnapshot(),
        baseCardContext: getBaseCardContext(state),
        privateContext: state.privateContext,
        dispatch,
    };
    const container = document.createElement("div");
    const root = createRoot(container);

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

        const undo = [...container.querySelectorAll<HTMLButtonElement>("button.MuiLink-root")]
            .find((button) => button.textContent?.includes("force-unlocked"));
        expect(undo).toBeDefined();
        await act(async () => undo?.click());
        expect(dispatch).toHaveBeenCalledWith({ type: "force-unlock", value: false });
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
