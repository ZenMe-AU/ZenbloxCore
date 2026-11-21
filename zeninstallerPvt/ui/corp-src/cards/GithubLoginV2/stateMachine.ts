/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import {
  lifecycleReducer,
  initialLifecycle,
  type Lifecycle,
  type LifecycleState,
} from "../../components/useBaseCard";

export type AuthPhase = "ready" | "action" | "complete" | "error";

export type State = { lifecycle: LifecycleState & { targetPhase: AuthPhase | null } };

export type Event = { type: "phase-changed"; phase: AuthPhase | null };

export const initialState: State = {
  lifecycle: { targetPhase: null, context: initialLifecycle },
};

export function getGithubLoginPhase({
  redirecting,
  verifying,
  loggingIn,
  account,
  sessionExpired,
}: {
  redirecting: "login" | "logout" | null;
  verifying: boolean;
  loggingIn: boolean;
  account: unknown;
  sessionExpired: boolean;
}): AuthPhase | null {
  return redirecting === "login" || verifying
    ? "action"
    : loggingIn ? null : account ? "complete" : sessionExpired ? "error" : "ready";
}

function reconcileLifecycle(context: LifecycleState["context"], phase: AuthPhase): LifecycleState["context"] {
  let current = context;
  const transition = (lifecycle: Lifecycle) => {
    current = lifecycleReducer(current, { type: "transition", lifecycle });
  };
  if (current.lifecycle === phase) return current;

  if (current.lifecycle === "blocked" || current.lifecycle === "complete" || current.lifecycle === "error") transition("loading");

  switch (phase) {
    case "ready":
      if (current.lifecycle === "action" || current.lifecycle === "commit") {
        transition("error");
        transition("loading");
      }
      if (current.lifecycle === "loading") transition("ready");
      break;
    case "action":
      if (current.lifecycle === "loading" || current.lifecycle === "ready") transition("action");
      break;
    case "complete":
      if (current.lifecycle === "ready") transition("action");
      if (current.lifecycle === "loading" || current.lifecycle === "action") transition("commit");
      if (current.lifecycle === "commit") transition("complete");
      break;
    case "error":
      if (current.lifecycle === "loading") transition("action");
      if (current.lifecycle === "ready" || current.lifecycle === "action" || current.lifecycle === "commit") transition("error");
      break;
  }
  return current;
}

export function reducer(state: State, event: Event): State {
  if (event.phase === state.lifecycle.targetPhase) return state;
  return {
    lifecycle: {
      targetPhase: event.phase,
      context: event.phase === null ? state.lifecycle.context : reconcileLifecycle(state.lifecycle.context, event.phase),
    },
  };
}