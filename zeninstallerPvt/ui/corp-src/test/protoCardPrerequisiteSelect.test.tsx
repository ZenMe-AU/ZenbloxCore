/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it, vi } from "vitest";
import { createAppContext } from "../appContext";
import BaseCard from "../components/BaseCard";
import { CardContentMain } from "../cards/ProtoCard/ProtoCard";
import { getBaseCardContext, initialState, reducer, stateGraph } from "../cards/ProtoCard/stateMachine";
import type { UseProtoCard } from "../cards/ProtoCard/useProtoCard";
import theme from "../theme";

function publishGithubLogin(store: ReturnType<typeof createAppContext>) {
    store.update("github_login_v2", {
        title: "GitHub login 2",
        currentBaseCardStatus: "complete",
        currentStatus: "signed-in",
        githubAccount: null,
        githubToken: null,
        githubMode: null,
    });
}

function publishRepo(store: ReturnType<typeof createAppContext>, currentBaseCardStatus: "ready" | "complete") {
    store.update("repo_v2", {
        title: "Repository V2",
        currentBaseCardStatus,
        currentStatus: currentBaseCardStatus,
        githubRepository: null,
    });
}

function publishProto(store: ReturnType<typeof createAppContext>) {
    store.update("proto_card", {
        title: "ProtoCard prototype card",
        currentBaseCardStatus: "ready",
        currentStatus: "ready",
    });
}

it("offers only registered prerequisite IDs and dispatches the selected ID", async () => {
    const store = createAppContext();
    publishGithubLogin(store);
    publishRepo(store, "ready");
    publishProto(store);
    const state = reducer(initialState, { type: "check-prerequisites" });
    const dispatch = vi.fn();
    const protoCard: UseProtoCard = {
        baseCardContext: getBaseCardContext(state),
        privateContext: { ...state.privateContext, appContext: store.getSnapshot(), dispatch },
    };
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
        await act(async () => root.render(
            <ThemeProvider theme={theme}>
                <BaseCard baseCardContext={protoCard.baseCardContext} appContext={protoCard.privateContext.appContext} expanded onToggle={() => { }}>
                    <CardContentMain {...protoCard} />
                </BaseCard>
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

it("models forceUnlocked as a first-class lifecycle state", () => {
    const blocked = reducer(
        reducer(initialState, { type: "sync-card-prerequisites", unmet: ["repo_v2"] }),
        { type: "check-prerequisites" },
    );
    expect(stateGraph.blocked.transitions).toContain("forceUnlocked");

    const forceUnlocked = reducer(blocked, { type: "transition", lifecycle: "forceUnlocked" });
    expect(forceUnlocked.lifecycle).toBe("forceUnlocked");
    expect(stateGraph.forceUnlocked.transitions).toContain("blocked");
    expect(reducer(forceUnlocked, { type: "transition", lifecycle: "blocked" }).lifecycle).toBe("blocked");
});

it("links a failed registered prerequisite to its card", async () => {
    const store = createAppContext();
    publishGithubLogin(store);
    publishRepo(store, "ready");
    publishProto(store);
    const loading = reducer(initialState, { type: "sync-card-prerequisites", unmet: ["repo_v2"] });
    const state = reducer(loading, { type: "check-prerequisites" });
    const protoCard: UseProtoCard = {
        baseCardContext: getBaseCardContext(state),
        privateContext: { ...state.privateContext, appContext: store.getSnapshot(), dispatch: vi.fn() },
    };
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
        await act(async () => root.render(
            <ThemeProvider theme={theme}>
                <BaseCard baseCardContext={protoCard.baseCardContext} appContext={protoCard.privateContext.appContext} expanded onToggle={() => { }}>
                    <CardContentMain {...protoCard} />
                </BaseCard>
            </ThemeProvider>
        ));

        const repoLink = [...container.querySelectorAll<HTMLAnchorElement>("a.MuiLink-root")]
            .find((button) => button.textContent?.includes("Repository V2 (repo_v2)"));
        expect(repoLink).toBeDefined();
        expect(repoLink?.getAttribute("href")).toBe("#card-repo_v2");
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

