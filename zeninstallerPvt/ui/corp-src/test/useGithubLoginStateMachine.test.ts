/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import {
  getGithubLoginPhase,
  githubLoginLifecycleReducer,
  initialGithubLoginLifecycle,
} from "../cards/GithubLoginV2/stateMachine";

it("derives auth phases and reconciles them through the shared lifecycle", () => {
  expect(getGithubLoginPhase({ redirecting: null, verifying: false, loggingIn: true, account: null, sessionExpired: false })).toBeNull();
  expect(getGithubLoginPhase({ redirecting: "login", verifying: false, loggingIn: false, account: null, sessionExpired: false })).toBe("action");

  const ready = githubLoginLifecycleReducer(initialGithubLoginLifecycle, { type: "phase-changed", phase: "ready" });
  expect(ready.context.lifecycle).toBe("ready");
  const action = githubLoginLifecycleReducer(ready, { type: "phase-changed", phase: "action" });
  expect(action.context.lifecycle).toBe("action");
  const complete = githubLoginLifecycleReducer(action, { type: "phase-changed", phase: "complete" });
  expect(complete.context.lifecycle).toBe("complete");
  expect(githubLoginLifecycleReducer(complete, { type: "phase-changed", phase: "ready" }).context.lifecycle).toBe("ready");
});