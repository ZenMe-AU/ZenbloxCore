/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import {
  getGithubLoginPhase,
  initialState,
  reducer,
  toBaseLifecycle,
} from "../cards/GithubLoginV2/stateMachine";

it("derives auth phases and maps them to BaseCard display lifecycle", () => {
  expect(getGithubLoginPhase({ redirecting: null, verifying: false, loggingIn: true, account: null, sessionExpired: false })).toBe("checking");
  expect(getGithubLoginPhase({ redirecting: "login", verifying: false, loggingIn: false, account: null, sessionExpired: false })).toBe("signing-in");

  const signedOut = reducer(initialState, { type: "phase-changed", phase: "signed-out" });
  expect(signedOut.phase).toBe("signed-out");
  expect(toBaseLifecycle(signedOut.phase)).toBe("ready");
  const signingIn = reducer(signedOut, { type: "phase-changed", phase: "signing-in" });
  expect(toBaseLifecycle(signingIn.phase)).toBe("action");
  const signedIn = reducer(signingIn, { type: "phase-changed", phase: "signed-in" });
  expect(toBaseLifecycle(signedIn.phase)).toBe("complete");
  expect(toBaseLifecycle(reducer(signedIn, { type: "phase-changed", phase: "expired" }).phase)).toBe("error");
});