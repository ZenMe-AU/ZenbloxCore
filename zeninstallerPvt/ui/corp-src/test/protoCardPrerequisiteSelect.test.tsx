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
import { initialState, reducer, stateGraph } from "../cards/ProtoCard/stateMachine";
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

function ProtoCardHarness({ store }: { store: ReturnType<typeof createAppContext> }) {
    return <ThemeProvider theme={theme}><ProtoCard {...store} /></ThemeProvider>;
}

async function expandCard(container: HTMLElement) {
    await act(async () => container.querySelector<HTMLButtonElement>("#card-title-proto_card button")?.click());
}

async function setPrerequisite(container: HTMLElement, value: string) {
    const select = container.querySelector<HTMLSelectElement>("#proto-card-prerequisites select");
    expect(select).toBeDefined();
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
        select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

it("offers only registered prerequisite IDs and applies the selection", async () => {
    vi.useFakeTimers();
    const store = createAppContext();
    publishGithubLogin(store);
    publishRepo(store, "ready");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
        await act(async () => root.render(<ProtoCardHarness store={store} />));
        await expandCard(container);
        await act(async () => vi.advanceTimersByTime(2000));

        const selects = container.querySelectorAll<HTMLSelectElement>("select");
        expect(selects).toHaveLength(2);
        expect(container.querySelector(".MuiInputLabel-root")?.classList.contains("MuiInputLabel-shrink")).toBe(true);
        expect([...selects[0].options].map(({ value }) => value)).toEqual([
            "", "github_login_v2", "repo_v2",
        ]);
        expect([...selects[0].options].map(({ textContent }) => textContent)).toContain("Repository V2 (repo_v2)");

        await setPrerequisite(container, "repo_v2");
        expect(store.getSnapshot().cards.proto_card).toMatchObject({ currentBaseCardStatus: "loading" });
        expect(container.querySelectorAll("select")).toHaveLength(0);
        await act(async () => vi.advanceTimersByTime(2000));
        expect(store.getSnapshot().cards.proto_card).toMatchObject({ currentBaseCardStatus: "blocked" });
        expect(container.textContent).toContain("repo_v2");
    } finally {
        await act(async () => root.unmount());
        container.remove();
        vi.useRealTimers();
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
    vi.useFakeTimers();
    const store = createAppContext();
    publishGithubLogin(store);
    publishRepo(store, "ready");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
        await act(async () => root.render(<ProtoCardHarness store={store} />));
        await expandCard(container);
        await act(async () => vi.advanceTimersByTime(2000));
        await setPrerequisite(container, "repo_v2");
        await act(async () => vi.advanceTimersByTime(2000));

        const repoLink = [...container.querySelectorAll<HTMLAnchorElement>("a.MuiLink-root")]
            .find((button) => button.textContent?.includes("Repository V2 (repo_v2)"));
        expect(repoLink).toBeDefined();
        expect(repoLink?.getAttribute("href")).toBe("#card-repo_v2");
    } finally {
        await act(async () => root.unmount());
        container.remove();
        vi.useRealTimers();
    }
});

