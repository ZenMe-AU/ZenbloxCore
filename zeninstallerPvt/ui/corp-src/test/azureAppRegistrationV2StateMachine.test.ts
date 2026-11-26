/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { canLifecycleTransition, getBaseCardContext, initialState, reducer, stateGraph } from "../cards/AzureAppRegistrationV2/stateMachine";

const steps = [{ id: "app", label: "Create app registration", status: "pending" as const }];

it("owns scope, run progress and the completed result", () => {
  const scoped = reducer(initialState, { type: "scope-changed", scopeKey: "tenant-a" });
  const running = reducer(scoped, { type: "run-started", scopeKey: "tenant-a", runId: 1, steps });
  const updated = reducer(running, {
    type: "step-updated",
    scopeKey: "tenant-a",
    runId: 1,
    stepId: "app",
    status: "done",
    detail: "client-id",
  });
  const completed = reducer(updated, {
    type: "run-completed",
    scopeKey: "tenant-a",
    runId: 1,
    clientId: "client-id",
  });

  expect(completed).toEqual({
    scopeKey: "tenant-a",
    activeRunId: null,
    steps: [{ ...steps[0], status: "done", detail: "client-id", progress: undefined }],
    result: { scopeKey: "tenant-a", clientId: "client-id" },
    autoSaveCounter: 1,
  });
});

it("resets a run when the scope changes and ignores its late events", () => {
  const scoped = reducer(initialState, { type: "scope-changed", scopeKey: "tenant-a" });
  const running = reducer(scoped, { type: "run-started", scopeKey: "tenant-a", runId: 1, steps });
  const changed = reducer(running, { type: "scope-changed", scopeKey: "tenant-b" });
  const staleCompletion = reducer(changed, {
    type: "run-completed",
    scopeKey: "tenant-a",
    runId: 1,
    clientId: "stale-client-id",
  });

  expect(changed).toEqual({
    scopeKey: "tenant-b",
    activeRunId: null,
    steps: [],
    result: null,
    autoSaveCounter: 0,
  });
  expect(staleCompletion).toBe(changed);
});

it("ignores events from an earlier run in the same scope", () => {
  const scoped = reducer(initialState, { type: "scope-changed", scopeKey: "tenant-a" });
  const firstRun = reducer(scoped, { type: "run-started", scopeKey: "tenant-a", runId: 1, steps });
  const secondRun = reducer(firstRun, { type: "run-started", scopeKey: "tenant-a", runId: 2, steps });

  expect(reducer(secondRun, {
    type: "run-failed",
    scopeKey: "tenant-a",
    runId: 1,
  })).toBe(secondRun);
});

it("projects lifecycle and summary from state-machine state", () => {
  const baseCardContext = getBaseCardContext(initialState, {
    unmetCardPrerequisites: [],
    blockedSummary: "Waiting for Azure login 2",
    prerequisitesMet: true,
    checkingMessage: null,
    managementAccessStatus: "ready",
    discoveryError: null,
    rbacStatus: "sp-not-found",
    rbacError: null,
    differsFromGithub: false,
    verified: false,
    planClientIdMismatch: false,
    hasSavedClientId: true,
  });

  expect(baseCardContext).toMatchObject({
    lifecycle: "ready",
    summary: "Not found in the selected tenant — recreate it",
    stateMachine: { currentState: "ready" },
  });
});

it("stores no lifecycle: it is derived", () => {
  expect(initialState).not.toHaveProperty("lifecycle");
});

it("allows a run only where the graph leads to running", () => {
  const runnable = Object.keys(stateGraph).filter((lifecycle) => canLifecycleTransition(lifecycle as keyof typeof stateGraph, "running"));
  expect(runnable).toEqual(["ready", "complete", "error"]);
});
