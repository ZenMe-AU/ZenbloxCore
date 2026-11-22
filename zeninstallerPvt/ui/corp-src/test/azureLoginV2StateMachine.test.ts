/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import {
  canTransition,
  deriveLifecycle,
  initialState,
  reducer,
  stateGraph,
  stateMachine,
  toBaseCardLifecycle,
  type Lifecycle,
  type State,
} from "../cards/AzureLoginV2/stateMachine";

const signedOut = {
  configured: true, loggingIn: false, redirecting: false, account: null, confirming: false,
  loginError: null, tenantIdError: null, tenantId: null,
};
const signedIn = { ...signedOut, account: { username: "org@example.com" } };

function walk(path: Lifecycle[]): State {
  return path.reduce((state, lifecycle) => reducer(state, { type: "transition", lifecycle }), initialState);
}

it("derives every lifecycle from the sign-in facts", () => {
  expect(deriveLifecycle({ ...signedOut, configured: false, loggingIn: true })).toBe("unconfigured");
  expect(deriveLifecycle({ ...signedOut, loggingIn: true })).toBe("loading");
  expect(deriveLifecycle(signedOut)).toBe("signed-out");
  expect(deriveLifecycle({ ...signedOut, redirecting: true })).toBe("signing-in");
  expect(deriveLifecycle({ ...signedOut, loginError: "Login failed" })).toBe("error");
  expect(deriveLifecycle(signedIn)).toBe("selecting-tenant");
  expect(deriveLifecycle({ ...signedIn, confirming: true, tenantId: "tenant-1" })).toBe("confirming-tenant");
  expect(deriveLifecycle({ ...signedIn, tenantId: "tenant-1" })).toBe("tenant-confirmed");
  // A failed later pick outranks the tenant confirmed before it.
  expect(deriveLifecycle({ ...signedIn, tenantId: "tenant-1", tenantIdError: "Couldn't reach that tenant" })).toBe("error");
  // The home tenant is confirmed as "" on startup, which is not a tenant choice yet.
  expect(deriveLifecycle({ ...signedIn, tenantId: "" })).toBe("selecting-tenant");
});

it("maps each state to its BaseCard lifecycle and keeps transitions inside the graph", () => {
  expect(stateMachine.graph).toBe(stateGraph);
  expect(Object.fromEntries(Object.keys(stateGraph).map((state) => [state, toBaseCardLifecycle(state as Lifecycle)]))).toEqual({
    loading: "loading",
    unconfigured: "blocked",
    "signed-out": "ready",
    "signing-in": "action",
    "selecting-tenant": "action",
    "confirming-tenant": "commit",
    "tenant-confirmed": "complete",
    error: "error",
  });
  for (const node of Object.values(stateGraph)) {
    for (const target of node.transitions) expect(stateGraph).toHaveProperty([target]);
  }
});

it("walks the sign-in and tenant paths and rejects steps the graph does not allow", () => {
  expect(walk(["signed-out", "signing-in", "error", "signing-in"]).lifecycle).toBe("signing-in");
  const confirmed = walk(["selecting-tenant", "confirming-tenant", "tenant-confirmed"]);
  expect(toBaseCardLifecycle(confirmed.lifecycle)).toBe("complete");
  expect(walk(["tenant-confirmed", "confirming-tenant", "error", "confirming-tenant", "selecting-tenant", "signed-out"]).lifecycle)
    .toBe("signed-out");
  expect(reducer(confirmed, { type: "transition", lifecycle: "tenant-confirmed" })).toBe(confirmed);

  // A fast silent token can land in the same render batch as the pick, skipping confirming-tenant.
  expect(canTransition(walk(["selecting-tenant"]), "tenant-confirmed")).toBe(true);
  expect(canTransition(walk(["signed-out"]), "tenant-confirmed")).toBe(false);
  expect(() => walk(["signed-out", "tenant-confirmed"])).toThrow("Cannot transition from signed-out to tenant-confirmed");
  expect(() => walk(["unconfigured", "loading"])).toThrow();
  expect(() => walk(["signed-out", "signing-in", "signed-out"])).toThrow();
});
