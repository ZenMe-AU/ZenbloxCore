/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext } from "../../appContext";
import { checkPrerequisites, type BaseCardContext, type Lifecycle } from "../../components/useBaseCard";
import type { CardId } from "../../types";

export const githubLoginCardId: CardId = "github_login_v2";

export const initialRepoCardContext = {
  cardId: "repo_v2",
  title: "Repository & environment 2",
  prerequisiteIds: [githubLoginCardId],
} satisfies Omit<BaseCardContext, "lifecycle">;

export type RepoPhase = "checking" | "blocked" | "selecting" | "working" | "complete" | "error";

export type State = { phase: RepoPhase };

export type Event = { type: "phase-changed"; phase: RepoPhase };

export const initialState: State = { phase: "checking" };

const baseLifecycleByPhase: Record<RepoPhase, Lifecycle> = {
  checking: "loading",
  blocked: "blocked",
  selecting: "ready",
  working: "action",
  complete: "complete",
  error: "error",
};

export function toBaseLifecycle(phase: RepoPhase): Lifecycle {
  return baseLifecycleByPhase[phase];
}

export function getRepoPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: BaseCardContext,
) {
  if (checkPrerequisites(appContext, baseCardContext).length > 0) return null;
  const login = appContext.cards[githubLoginCardId];
  if (!login?.initialised || !login.githubAccount || !login.githubToken || !login.githubMode) return null;
  return { user: login.githubAccount, token: login.githubToken, mode: login.githubMode };
}

export function reducer(state: State, event: Event): State {
  return event.phase === state.phase ? state : { phase: event.phase };
}