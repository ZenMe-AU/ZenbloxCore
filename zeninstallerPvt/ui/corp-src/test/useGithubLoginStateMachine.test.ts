/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import {
  getGithubLoginPhase,
  initialState,
  reducer,
} from "../cards/GithubLoginV2/stateMachine";

it("derives auth phases and reconciles them through the shared lifecycle", () => {
  expect(getGithubLoginPhase({ redirecting: null, verifying: false, loggingIn: true, account: null, sessionExpired: false })).toBeNull();
  expect(getGithubLoginPhase({ redirecting: "login", verifying: false, loggingIn: false, account: null, sessionExpired: false })).toBe("action");

  const ready = reducer(initialState, { type: "phase-changed", phase: "ready" });
  expect(ready.lifecycle.context.lifecycle).toBe("ready");
  const action = reducer(ready, { type: "phase-changed", phase: "action" });
  expect(action.lifecycle.context.lifecycle).toBe("action");
  const complete = reducer(action, { type: "phase-changed", phase: "complete" });
  expect(complete.lifecycle.context.lifecycle).toBe("complete");
  expect(reducer(complete, { type: "phase-changed", phase: "ready" }).lifecycle.context.lifecycle).toBe("ready");
});