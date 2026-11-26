/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import {
  canTransition, createInitialState, getBaseCardContext, reducer, type State, type StoredResults,
} from "../cards/AccessPassV2/stateMachine";

const pass = { accessPassValue: "test-pass", tenantId: "tenant-1", targetUserId: "user-1", tapMethodId: "tap-1" };
const saved: StoredResults = { identityKey: "identity-1", passes: { "user-1": pass }, deliveryConfirmed: {}, completed: {} };
const ready = () => reducer(reducer(createInitialState("identity-1", null), {
  type: "sync-prerequisites", identityKey: "identity-1", unmet: [], saved: null,
}), { type: "checked", error: null, consentRequired: false });

function started(): State {
  const confirming = reducer(ready(), { type: "confirm-user", userId: "user-1" });
  return reducer(reducer(confirming, { type: "photo-id", confirmed: true }), { type: "start" });
}

function completed(): State {
  let state = started();
  for (const stepId of ["policy", "removeMethods", "rotatePassword"] as const) {
    state = reducer(state, { type: "step-finished", stepId, status: stepId === "policy" ? "skipped" : "done", detail: "Done" });
  }
  return reducer(state, { type: "pass-created", result: pass });
}

describe("AccessPassV2 state machine", () => {
  it("requires live prerequisites and verified photo ID for destructive actions", () => {
    const blocked = createInitialState(null, null);
    expect(getBaseCardContext(blocked).lifecycle).toBe("blocked");
    expect(canTransition(blocked, "confirming")).toBe(false);
    expect(() => reducer(blocked, { type: "confirm-user", userId: "user-1" })).toThrow("Cannot transition");
    const confirming = reducer(ready(), { type: "confirm-user", userId: "user-1" });
    expect(canTransition(confirming, "policy")).toBe(false);
    expect(() => reducer(confirming, { type: "start" })).toThrow("Cannot transition");
    expect(started().lifecycle).toBe("policy");
    expect(() => reducer(started(), { type: "step-finished", stepId: "rotatePassword", status: "done", detail: "" })).toThrow("Unexpected completion");
  });

  it("owns ordered workflow, completion and delivery confirmation", () => {
    const state = completed();
    expect(getBaseCardContext(state)).toMatchObject({ lifecycle: "complete", done: true, stateMachine: { currentState: "complete" } });
    expect(state.privateContext.steps.map((step) => step.status)).toEqual(["skipped", "done", "done", "done"]);
    expect(() => reducer(state, { type: "mark-complete", userId: "user-1" })).toThrow("Confirm that the user");
    const delivered = reducer(state, { type: "delivery-confirmed", userId: "user-1", confirmed: true });
    const marked = reducer(delivered, { type: "mark-complete", userId: "user-1" });
    expect(marked.privateContext.completed["user-1"]).toBe(true);
    expect(reducer(marked, { type: "delivery-confirmed", userId: "user-1", confirmed: false }).privateContext.completed["user-1"]).toBe(false);
    const retry = reducer(reducer(marked, { type: "confirm-user", userId: "user-1" }), { type: "photo-id", confirmed: true });
    const rerun = reducer(retry, { type: "start" });
    expect(rerun.privateContext.passes["user-1"]).toBeUndefined();
    expect(rerun.privateContext.completed["user-1"]).toBe(false);
    expect(rerun.privateContext.deliveryConfirmed["user-1"]).toBe(false);
  });

  it("records the failed step without marking the workflow complete", () => {
    const removing = reducer(started(), { type: "step-finished", stepId: "policy", status: "skipped", detail: "Already enabled" });
    const password = reducer(removing, { type: "step-finished", stepId: "removeMethods", status: "done", detail: "Removed" });
    const failed = reducer(password, { type: "run-failed", error: "Password reset denied", consentRequired: false });
    expect(getBaseCardContext(failed)).toMatchObject({ lifecycle: "error", done: false });
    expect(failed.privateContext.steps.find((step) => step.id === "rotatePassword")).toMatchObject({ status: "error", detail: "Password reset denied" });
    expect(failed.privateContext.steps.find((step) => step.id === "tap")?.status).toBe("pending");
    expect(reducer(failed, { type: "reset" }).lifecycle).toBe("ready");
  });

  it("clears private outputs when identity or tenant changes and scopes restored data", () => {
    const state = completed();
    const changed = reducer(state, { type: "sync-prerequisites", identityKey: "identity-2", unmet: [], saved });
    expect(changed.privateContext.passes).toEqual({});
    expect(changed.privateContext.steps).toEqual([]);
    expect(changed.privateContext.photoIdConfirmed).toBe(false);
    expect(createInitialState("identity-1", saved).privateContext.validationPending).toBe(true);
    const unmet = ["azure_login_v2"] as const;
    const blocked = reducer(state, { type: "sync-prerequisites", identityKey: null, unmet: [...unmet], saved: null });
    expect(getBaseCardContext(blocked)).toMatchObject({ lifecycle: "blocked", done: false, unmetCardPrerequisites: unmet });
    expect(blocked.baseCardContext).not.toBe(state.baseCardContext);
    expect(blocked.baseCardContext.unmetCardPrerequisites).not.toBe(unmet);
  });

  it("clamps pagination and keeps card-only records out of BaseCardContext", () => {
    const state = reducer(ready(), { type: "page", page: 99, totalPages: 2 });
    expect(state.privateContext).toMatchObject({ currentPage: 2, pageInput: "2" });
    expect(() => reducer(state, { type: "page", page: NaN, totalPages: 2 })).toThrow("valid page");
    const context = getBaseCardContext(completed());
    expect(context).not.toHaveProperty("passes");
    expect(context).not.toHaveProperty("dispatch");
    expect(context).not.toHaveProperty("photoIdConfirmed");
  });

  it("clears photo-ID confirmation when refreshing prerequisites and users", () => {
    const confirming = reducer(reducer(ready(), { type: "confirm-user", userId: "user-1" }), { type: "photo-id", confirmed: true });
    const refreshed = reducer(confirming, { type: "sync-prerequisites", identityKey: "identity-1", unmet: [], saved: null });
    expect(refreshed.privateContext.confirmationUserId).toBeNull();
    expect(refreshed.privateContext.photoIdConfirmed).toBe(false);
    expect(reducer(refreshed, { type: "checked", error: null, consentRequired: false }).lifecycle).toBe("ready");
  });
});
