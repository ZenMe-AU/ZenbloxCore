/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext, AppContextCardId } from "../../appContext";
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

export const cardId = "repo_v2" as const;

declare module "../../appContext" {
  interface SharedCardDataById {
    [cardId]: {
      githubRepository: Readonly<{
        account: Readonly<GithubAccount>;
        repository: Readonly<Pick<GithubRepositoryOption, "id" | "name" | "htmlUrl">>;
        environment: Readonly<GithubEnvironment>;
      }> | null;
    };
  }
}

const githubLoginCardId = "github_login_v2" satisfies BaseCardContext["cardId"];

export const initialRepoCardContext = {
  cardId,
  title: "Repository & environment 2",
  prerequisiteIds: [githubLoginCardId],
} satisfies Omit<BaseCardContext<Lifecycle>, "lifecycle">;

export const lifecycles = ["loading", "blocked", "ready", "action", "complete", "error"] as const;
export type Lifecycle = typeof lifecycles[number];

export type State = BaseCardState<Lifecycle> & {
  baseCardContext: Omit<BaseCardContext<Lifecycle>, "lifecycle"> & {
    unmetCardPrerequisites: AppContextCardId[];
  };
};

export type Event =
  | BaseCardEvent<Lifecycle>
  | {
    type: "sync";
    lifecycle: Lifecycle;
    unmetCardPrerequisites: AppContextCardId[];
  };

export const initialState: State = {
  lifecycle: "loading",
  baseCardContext: {
    ...initialRepoCardContext,
    unmetCardPrerequisites: [githubLoginCardId],
  },
};

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
  const nextState = event.lifecycle;
  if (!canTransition(state, nextState)) {
    throw new Error(`Cannot transition from ${state.lifecycle} to ${nextState}`);
  }
  const sameLifecycle = nextState === state.lifecycle;
  if (event.type === "transition") return sameLifecycle ? state : { ...state, lifecycle: nextState };
  const samePrerequisites = state.baseCardContext.unmetCardPrerequisites.length === event.unmetCardPrerequisites.length
    && state.baseCardContext.unmetCardPrerequisites.every((id, index) => id === event.unmetCardPrerequisites[index]);
  if (sameLifecycle && samePrerequisites) return state;
  return {
    ...state,
    lifecycle: nextState,
    baseCardContext: { ...state.baseCardContext, unmetCardPrerequisites: event.unmetCardPrerequisites },
  };
}

export function getBaseCardContext(state: State, summary: string) {
  return {
    ...state.baseCardContext,
    lifecycle: toBaseCardLifecycle(state.lifecycle),
    stateMachine: { graph: stateGraph, currentState: state.lifecycle },
    summary,
  } as const;
}

export const stateMachine: BaseCardStateMachine<Lifecycle, State, Event> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};