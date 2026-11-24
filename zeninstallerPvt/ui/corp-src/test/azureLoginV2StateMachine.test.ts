/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { canTransition, getBaseCardContext, initialState, reducer, stateGraph, stateMachine, toBaseCardLifecycle } from "../cards/AzureLoginV2/stateMachine";
import type { AzureAccount } from "../types";

const account = {
  username: "org@example.com",
  homeAccountId: "home",
  environment: "login.microsoftonline.com",
  tenantId: "tenant-home",
  localAccountId: "local",
} as AzureAccount;

const tenants = [{ tenantId: "tenant-1", displayName: "Tenant One" }];

it("owns the session and login workflow facts", () => {
  const signedOut = reducer(initialState, { type: "session-empty" });
  expect(getBaseCardContext(signedOut)).toMatchObject({ lifecycle: "ready", summary: "Sign in to Azure", done: false });

  const signingIn = reducer(signedOut, { type: "login-requested" });
  expect(signingIn.lifecycle).toBe("signing-in");
  const failed = reducer(signingIn, { type: "login-failed", error: "Login failed" });
  expect(getBaseCardContext(failed)).toMatchObject({ lifecycle: "error", summary: "Login failed" });
  expect(reducer(failed, { type: "login-requested" }).loginError).toBeNull();
});

it("owns tenant selection, confirmation, errors and logout", () => {
  const restored = reducer(initialState, { type: "session-restored", account, prefilledTenantId: "Tenant One", confirmedTenantId: null });
  expect(restored).toMatchObject({ lifecycle: "selecting-tenant", manualTenantId: "Tenant One" });
  expect(getBaseCardContext(restored, tenants)).toMatchObject({
    cardId: "azure_login_v2",
    lifecycle: "action",
    summary: "Select a tenant",
    done: false,
  });
  expect(getBaseCardContext(restored, tenants)).not.toHaveProperty("tenants");
  expect(getBaseCardContext(restored, tenants)).not.toHaveProperty("manualTenantId");

  const confirming = reducer(restored, { type: "tenant-confirmation-started", tenantId: "tenant-1" });
  expect(getBaseCardContext(confirming).lifecycle).toBe("commit");
  const confirmed = reducer(confirming, { type: "tenant-confirmed", tenantId: "tenant-1", account });
  expect(getBaseCardContext(confirmed, tenants)).toMatchObject({ lifecycle: "complete", summary: "org@example.com · Tenant One", done: true });

  const retrying = reducer(confirmed, { type: "tenant-confirmation-started", tenantId: "tenant-2" });
  const failed = reducer(retrying, { type: "tenant-confirmation-failed", error: "No access" });
  expect(getBaseCardContext(failed)).toMatchObject({ lifecycle: "error", summary: "No access", done: false });
  expect(reducer(failed, { type: "logout-completed" })).toMatchObject({ lifecycle: "signed-out", account: null, confirmedTenantId: null });
});

it("maps every workflow state to BaseCard and rejects invalid events", () => {
  expect(stateMachine.graph).toBe(stateGraph);
  expect(Object.fromEntries(Object.keys(stateGraph).map((state) => [state, toBaseCardLifecycle(state as keyof typeof stateGraph)]))).toEqual({
    loading: "loading",
    unconfigured: "blocked",
    "signed-out": "ready",
    "signing-in": "action",
    "selecting-tenant": "action",
    "confirming-tenant": "commit",
    "tenant-confirmed": "complete",
    error: "error",
  });
  expect(canTransition(reducer(initialState, { type: "session-empty" }), "tenant-confirmed")).toBe(false);
  expect(() => reducer(reducer(initialState, { type: "session-empty" }), {
    type: "tenant-confirmed", tenantId: "tenant-1", account,
  })).toThrow("Cannot transition from signed-out to tenant-confirmed");
  expect(reducer(initialState, { type: "unconfigured" }).lifecycle).toBe("unconfigured");
});
