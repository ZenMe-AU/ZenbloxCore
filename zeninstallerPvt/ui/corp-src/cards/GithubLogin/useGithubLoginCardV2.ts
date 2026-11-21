/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import {
  cardLifecycleReducer,
  initialCardLifecycle,
  type CardLifecycle,
  type CardLifecycleContext,
} from "../../components/cardLifecycle";
import type { UseGithubLoginCard } from "./useGithubLoginCard";

type AuthPhase = "ready" | "action" | "complete" | "error";

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
        // The shared lifecycle has no direct cancellation transition.
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

export function useGithubLoginCardV2(auth: UseGithubLoginCard) {
  const [state, setState] = useState<{ phase: AuthPhase | null; context: CardLifecycleContext }>({
    phase: null,
    context: initialCardLifecycle,
  });
  const { redirecting, loggingIn, verifying, account, sessionExpired } = auth;
  const phase: AuthPhase | null = redirecting === "login" || verifying
    ? "action"
    : loggingIn ? null : account ? "complete" : sessionExpired ? "error" : "ready";
  if (phase !== null && phase !== state.phase) {
    setState({ phase, context: reconcileLifecycle(state.context, phase) });
  }
  const baseCardContext = { cardId: auth.cardId, title: "GitHub login 2", summary: auth.summary, ...state.context };
  return {
    ...auth,
    baseCardContext,
    githubLoginContext: auth,
    shared: { title: baseCardContext.title, status: baseCardContext.lifecycle },
  };
}

export type UseGithubLoginCardV2 = ReturnType<typeof useGithubLoginCardV2>;
