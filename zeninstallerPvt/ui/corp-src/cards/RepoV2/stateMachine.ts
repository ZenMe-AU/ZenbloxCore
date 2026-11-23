/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext } from "../../appContext";
import type {
  BaseCardContext,
  BaseCardEvent,
  BaseCardState,
  BaseCardStateGraph,
  BaseCardStateMachine,
  Lifecycle as BaseCardLifecycle,
} from "../../components/basecardlifecycle";
import { checkPrerequisites } from "../../components/useBaseCard";
import type { GithubAccount, GithubEnvironment, GithubRepositoryOption } from "./types";

declare module "../../appContext" {
  interface SharedCardDataById {
    repo_v2: {
      githubRepository?: Readonly<{
        account: Readonly<GithubAccount>;
        repository: Readonly<Pick<GithubRepositoryOption, "id" | "name">>;
        environment: Readonly<GithubEnvironment>;
      }> | null;
    };
  }
}

export const githubLoginCardId = "github_login_v2" satisfies BaseCardContext["cardId"];

export const initialRepoCardContext = {
  cardId: "repo_v2",
  title: "Repository & environment 2",
  prerequisiteIds: [githubLoginCardId],
} satisfies Omit<BaseCardContext<Lifecycle>, "lifecycle">;

export const lifecycles = ["loading", "blocked", "ready", "action", "complete", "error"] as const;
export type Lifecycle = typeof lifecycles[number];

export type State = BaseCardState<Lifecycle>;

export type Event = BaseCardEvent<Lifecycle>;

export const initialState: State = { lifecycle: "loading" };

export const stateGraph: BaseCardStateGraph<Lifecycle> = {
  loading: { label: "Loading", baseCardLifecycle: "loading", transitions: ["blocked", "ready", "action", "complete", "error"] },
  blocked: { label: "Blocked", baseCardLifecycle: "blocked", transitions: ["loading", "ready", "action", "complete", "error"] },
  ready: { label: "Ready", baseCardLifecycle: "ready", transitions: ["blocked", "action", "complete", "error"] },
  action: { label: "Working", baseCardLifecycle: "action", transitions: ["blocked", "ready", "complete", "error"] },
  complete: { label: "Complete", baseCardLifecycle: "complete", transitions: ["loading", "blocked", "ready", "action", "error"] },
  error: { label: "Error", baseCardLifecycle: "error", transitions: ["loading", "blocked", "ready", "action", "complete"] },
};

export function toBaseCardLifecycle(state: Lifecycle): BaseCardLifecycle {
  return stateGraph[state].baseCardLifecycle;
}

export function getRepoPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: BaseCardContext<Lifecycle>,
) {
  if (checkPrerequisites(appContext, baseCardContext).length > 0) return null;
  const login = appContext.cards[githubLoginCardId];
  if (!login?.initialised || !login.githubAccount || !login.githubToken || !login.githubMode) return null;
  return { user: login.githubAccount, token: login.githubToken, mode: login.githubMode };
}

export function canTransition(currentState: State, nextState: Lifecycle): boolean {
  return currentState.lifecycle === nextState
    || stateGraph[currentState.lifecycle].transitions.some((lifecycle) => lifecycle === nextState);
}

export function reducer(state: State, event: Event): State {
  if (!canTransition(state, event.lifecycle)) {
    throw new Error(`Cannot transition from ${state.lifecycle} to ${event.lifecycle}`);
  }
  return event.lifecycle === state.lifecycle ? state : { lifecycle: event.lifecycle };
}

export const stateMachine: BaseCardStateMachine<Lifecycle> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};