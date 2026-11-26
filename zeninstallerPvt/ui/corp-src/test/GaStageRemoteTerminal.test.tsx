/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it, vi } from "vitest";
import type { Account, GhEnv } from "../types";
import theme from "../theme";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
  dispatch: vi.fn(),
}));
vi.mock("../api", () => ({ triggerRemoteLogin: mocks.dispatch }));
vi.mock("../api/backend", () => ({
  registerSession: mocks.register,
  deleteSession: mocks.remove,
  negotiateSession: vi.fn(),
}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    options = { cursorBlink: true, disableStdin: false };
    onData() {}
    dispose() {}
  },
}));

import { useRemoteTerminal } from "../cards/GaStage/useRemoteTerminal";

it("does not dispatch an abandoned terminal startup after registration finishes", async () => {
  let resolveRegister!: () => void;
  mocks.register.mockImplementation(() => new Promise<void>((resolve) => { resolveRegister = resolve; }));
  let terminal!: ReturnType<typeof useRemoteTerminal>;
  function Harness() {
    terminal = useRemoteTerminal({
      account: { login: "owner", id: 1 } as Account,
      repoName: "repo",
      workflowId: "deploy.yml",
      dir: "SubscriptionBudget",
      planRunId: "plan-1",
      selectedEnv: { id: 1, name: "PROD" } as GhEnv,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<ThemeProvider theme={theme}><Harness /></ThemeProvider>));
  let pending!: Promise<boolean>;
  await act(async () => { pending = terminal.start(); });
  await act(async () => {
    terminal.stop();
    resolveRegister();
    expect(await pending).toBe(false);
  });
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalled();
  await act(async () => root.unmount());
});

it("does not dispatch when operation tracking is replaced during registration", async () => {
  mocks.dispatch.mockClear();
  let resolveRegister!: () => void;
  mocks.register.mockImplementation(() => new Promise<void>((resolve) => { resolveRegister = resolve; }));
  let terminal!: ReturnType<typeof useRemoteTerminal>;
  function Harness() {
    terminal = useRemoteTerminal({
      account: { login: "owner", id: 1 } as Account,
      repoName: "repo", workflowId: "deploy.yml", dir: "SubscriptionBudget", planRunId: "plan-1",
      selectedEnv: { id: 1, name: "PROD" } as GhEnv,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<ThemeProvider theme={theme}><Harness /></ThemeProvider>));
  let current = true;
  let pending!: Promise<boolean>;
  await act(async () => { pending = terminal.start(() => current); });
  await act(async () => {
    current = false;
    resolveRegister();
    expect(await pending).toBe(false);
  });
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(terminal.status).toBe("closed");
  await act(async () => root.unmount());
});
