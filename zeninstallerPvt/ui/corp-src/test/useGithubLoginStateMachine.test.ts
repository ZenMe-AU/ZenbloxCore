/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import {
  deriveLifecycle,
  stateGraph,
  stateMachine,
  initialState,
  reducer,
  toBaseCardLifecycle,
} from "../cards/GithubLoginV2/stateMachine";

it("derives auth lifecycles and maps them to the BaseCard lifecycle", () => {
  expect(deriveLifecycle({ redirecting: null, verifying: false, loggingIn: true, account: null, sessionExpired: false })).toBe("loading");
  expect(deriveLifecycle({ redirecting: null, verifying: false, loggingIn: false, account: null, sessionExpired: false })).toBe("ready");
  expect(deriveLifecycle({ redirecting: "login", verifying: false, loggingIn: false, account: null, sessionExpired: false })).toBe("signing-in");
  expect(stateMachine.graph).toBe(stateGraph);

  const ready = reducer(initialState, { type: "transition", lifecycle: "ready" });
  expect(ready.lifecycle).toBe("ready");
  expect(toBaseCardLifecycle(ready.lifecycle)).toBe("ready");
  expect(stateGraph.loading.transitions).toContain("ready");
  expect(() => reducer(ready, { type: "transition", lifecycle: "signed-in" })).toThrow();
  const signingIn = reducer(ready, { type: "transition", lifecycle: "signing-in" });
  expect(toBaseCardLifecycle(signingIn.lifecycle)).toBe("action");
  const signedIn = reducer(signingIn, { type: "transition", lifecycle: "signed-in" });
  expect(toBaseCardLifecycle(signedIn.lifecycle)).toBe("complete");
  expect(toBaseCardLifecycle(reducer(signedIn, { type: "transition", lifecycle: "expired" }).lifecycle)).toBe("error");
});