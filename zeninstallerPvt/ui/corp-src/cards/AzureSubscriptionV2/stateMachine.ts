/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext } from "../../appContext";
import { checkPrerequisites } from "../../components/useBaseCard";
import type {
  Lifecycle as BaseCardLifecycle,
  BaseCardContext,
  BaseCardEvent,
  BaseCardState,
  BaseCardStateGraph,
  BaseCardStateMachine,
} from "../../components/basecardlifecycle";
import type { CardId } from "../../types";

declare module "../../appContext" {
  interface SharedCardDataById {
    azure_subscription_v2: {
      azureSubscription: Readonly<{ id: string; displayName: string; tenantId: string }> | null;
    };
  }
}

export const azureLoginCardId = "azure_login_v2" satisfies CardId;
export const repoCardId = "repo_v2" satisfies CardId;
export const githubLoginCardId = "github_login_v2" satisfies CardId;

export const initialCardContext = {
  cardId: "azure_subscription_v2",
  title: "Choose Azure subscription 2",
  prerequisiteIds: [azureLoginCardId, repoCardId],
} satisfies Omit<BaseCardContext, "lifecycle">;

export type Lifecycle = "blocked" | "loading" | "selecting" | "unsaved" | "saved" | "error";

// The lifecycle is derived after React batches updates, and the cards it waits for and the GitHub variables
// can change under it: every state can fall back to blocked or loading, blocked can land on a list already
// loaded, and a pick turns saved or unsaved as the variables load or save.
export const stateGraph = {
  blocked: {
    label: "Waiting for Azure login 2 and Repository & environment 2",
    baseCardLifecycle: "blocked",
    transitions: ["loading", "selecting", "unsaved", "saved", "error"],
  },
  loading: {
    label: "Loading subscriptions",
    baseCardLifecycle: "loading",
    transitions: ["blocked", "selecting", "unsaved", "saved", "error"],
  },
  selecting: {
    label: "Select a subscription",
    baseCardLifecycle: "ready",
    transitions: ["blocked", "loading", "unsaved", "saved"],
  },
  // Picked, but GitHub holds a different tenant or subscription (or none) until it is saved.
  unsaved: {
    label: "Unsaved change",
    baseCardLifecycle: "commit",
    transitions: ["blocked", "loading", "selecting", "saved"],
  },
  saved: {
    label: "Saved to GitHub",
    baseCardLifecycle: "complete",
    transitions: ["blocked", "loading", "selecting", "unsaved"],
  },
  // No subscriptions, or the list could not load; a new tenant or sign-in loads it again.
  error: {
    label: "No subscriptions",
    baseCardLifecycle: "error",
    transitions: ["blocked", "loading"],
  },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export type State = BaseCardState<Lifecycle>;

export type Event = BaseCardEvent<Lifecycle>;

export const initialState: State = { lifecycle: "blocked" };

export function toBaseCardLifecycle(state: Lifecycle): BaseCardLifecycle {
  return stateGraph[state].baseCardLifecycle;
}

// The signed-in account and confirmed tenant, once Azure login 2 and Repository & environment 2 are complete.
export function getPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: BaseCardContext,
) {
  if (checkPrerequisites(appContext, baseCardContext).length > 0) return null;
  const login = appContext.cards[azureLoginCardId];
  if (!login?.initialised || !login.azureAccount || !login.azureTenantId) return null;
  return { account: login.azureAccount, tenantId: login.azureTenantId };
}

// Where the pick is saved and GitHub login 2's token to save it with, once it and Repository & environment 2 are complete.
export function getGithubTarget(appContext: ReturnType<AppContext["getSnapshot"]>) {
  const login = appContext.cards[githubLoginCardId];
  const repo = appContext.cards[repoCardId];
  if (!login?.initialised || !repo?.initialised || login.currentBaseCardStatus !== "complete" || repo.currentBaseCardStatus !== "complete") return null;
  if (!login.githubToken || !repo.githubRepository) return null;
  return { token: login.githubToken, ...repo.githubRepository };
}

export function deriveLifecycle({
  prerequisitesMet,
  loaded,
  error,
  picked,
  saved,
}: {
  prerequisitesMet: boolean;
  loaded: boolean;
  error: string | null;
  picked: boolean;
  saved: boolean; // GitHub holds the picked tenant and subscription.
}): Lifecycle {
  if (!prerequisitesMet) return "blocked";
  if (!loaded) return "loading";
  if (error) return "error";
  if (!picked) return "selecting";
  return saved ? "saved" : "unsaved";
}

export function canTransition(currentState: State, nextState: Lifecycle): boolean {
  return currentState.lifecycle === nextState
    || stateGraph[currentState.lifecycle].transitions.some((lifecycle) => lifecycle === nextState);
}

export function reducer(state: State, event: Event): State {
  if (!canTransition(state, event.lifecycle)) {
    throw new Error(`Cannot transition from ${state.lifecycle} to ${event.lifecycle}`);
  }
  if (event.lifecycle === state.lifecycle) return state;
  return { lifecycle: event.lifecycle };
}

export const stateMachine: BaseCardStateMachine<Lifecycle> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};
