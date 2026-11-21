/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import {
  cardLifecycleReducer,
  initialCardLifecycle,
  type CardLifecycle,
  type CardLifecycleContext,
} from "../../components/useBaseCard";

export type AuthPhase = "ready" | "action" | "complete" | "error";

export type GithubLoginLifecycleState = {
  phase: AuthPhase | null;
  context: CardLifecycleContext;
};

export type GithubLoginLifecycleEvent = { type: "phase-changed"; phase: AuthPhase | null };

export const initialGithubLoginLifecycle: GithubLoginLifecycleState = {
  phase: null,
  context: initialCardLifecycle,
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

function reconcileLifecycle(context: CardLifecycleContext, phase: AuthPhase): CardLifecycleContext {
  let current = context;
  const transition = (lifecycle: CardLifecycle) => {
    current = cardLifecycleReducer(current, { type: "transition", lifecycle });
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

export function githubLoginLifecycleReducer(
  state: GithubLoginLifecycleState,
  event: GithubLoginLifecycleEvent,
): GithubLoginLifecycleState {
  if (event.phase === null || event.phase === state.phase) return state;
  return { phase: event.phase, context: reconcileLifecycle(state.context, event.phase) };
}