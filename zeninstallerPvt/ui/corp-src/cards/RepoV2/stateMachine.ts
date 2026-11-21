/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext } from "../../appContext";
import {
  cardLifecycleReducer,
  checkPrerequisites,
  initialCardLifecycle,
  type BaseCardContext,
  type CardLifecycle,
  type CardLifecycleContext,
} from "../../components/useBaseCard";
import type { CardId } from "../../types";

export const githubLoginCardId: CardId = "github_login_v2";

export const initialRepoCardContext = {
  cardId: "repo_v2",
  title: "Repository & environment 2",
  prerequisiteIds: [githubLoginCardId],
  ...initialCardLifecycle,
} satisfies BaseCardContext;

export type RepoCardLifecycleState = {
  phase: CardLifecycle;
  context: CardLifecycleContext;
};

export type RepoCardLifecycleEvent = { type: "phase-changed"; phase: CardLifecycle };

export const initialRepoCardLifecycle: RepoCardLifecycleState = {
  phase: "loading",
  context: initialCardLifecycle,
};

export function getRepoPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: BaseCardContext,
) {
  if (checkPrerequisites(appContext, baseCardContext).length > 0) return null;
  const login = appContext.cards[githubLoginCardId];
  if (!login?.initialised || !login.githubAccount || !login.githubToken || !login.githubMode) return null;
  return { user: login.githubAccount, token: login.githubToken, mode: login.githubMode };
}

function reconcileLifecycle(context: CardLifecycleContext, phase: CardLifecycle): CardLifecycleContext {
  let current = context;
  const transition = (lifecycle: CardLifecycle) => {
    current = cardLifecycleReducer(current, { type: "transition", lifecycle });
  };
  if (current.lifecycle === phase) return current;
  if (current.lifecycle === "blocked" || current.lifecycle === "complete" || current.lifecycle === "error") transition("loading");
  if ((phase === "loading" || phase === "blocked" || phase === "ready") && current.lifecycle !== "loading") {
    transition("error");
    transition("loading");
  }
  if (phase === "blocked" || phase === "ready") transition(phase);
  if (phase === "action") transition("action");
  if (phase === "complete") {
    if (current.lifecycle === "ready") transition("action");
    if (current.lifecycle === "loading" || current.lifecycle === "action") transition("commit");
    transition("complete");
  }
  if (phase === "error") {
    if (current.lifecycle === "loading") transition("action");
    transition("error");
  }
  return current;
}

export function repoCardLifecycleReducer(
  state: RepoCardLifecycleState,
  event: RepoCardLifecycleEvent,
): RepoCardLifecycleState {
  if (event.phase === state.phase) return state;
  return { phase: event.phase, context: reconcileLifecycle(state.context, event.phase) };
}