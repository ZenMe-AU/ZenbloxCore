/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import App from "../App";
import { createSharedContext } from "../sharedContext";
import theme from "../theme";

vi.mock("../sharedContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sharedContext")>();
  return { ...actual, createSharedContext: vi.fn(actual.createSharedContext) };
});

vi.mock("../cards/GithubSignup/useGithubSignupCard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cards/GithubSignup/useGithubSignupCard")>();
  return {
    ...actual,
    useGithubSignupCard: (...args: Parameters<typeof actual.useGithubSignupCard>) => {
      const card = actual.useGithubSignupCard(...args);
      return { ...card, shared: { title: "Test shared signup", status: card.status } };
    },
  };
});

describe("App - Home Page", () => {
  it("should render without crashing", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    expect(() => {
      root.render(React.createElement(App));
    }).not.toThrow();

    root.unmount();
  });

  it("should have a DOM container", () => {
    const container = document.createElement("div");
    expect(container).toBeTruthy();
  });

  it("publishes opted-in cards and updates their status after render", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    vi.mocked(createSharedContext).mockClear();
    try {
      root.render(<ThemeProvider theme={theme}><App /></ThemeProvider>);
      await expect.poll(() => vi.mocked(createSharedContext).mock.results.at(-1)?.value.getSnapshot().cards.repo).toMatchObject({
        initialised: true,
        title: "Repository & environment",
      });
      const store = vi.mocked(createSharedContext).mock.results.at(-1)!.value;
      expect(store.getSnapshot().cards.github_signup).toMatchObject({ initialised: true, title: "Test shared signup" });
      await expect.poll(() => store.getSnapshot().cards.github_login).toMatchObject({ initialised: true, title: "GitHub login", status: "ready" });
      expect(store.getSnapshot().cards.azure_login).toBeUndefined();
      await expect.poll(() => store.getSnapshot().cards.proto_card, { timeout: 5000 }).toMatchObject({
        initialised: true,
        title: "ProtoCard prototype card",
        status: "ready",
      });
    } finally {
      root.unmount();
      container.remove();
    }
  });
});
