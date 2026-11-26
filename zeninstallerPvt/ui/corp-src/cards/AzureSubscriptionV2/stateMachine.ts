/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type {
  Lifecycle as BaseCardLifecycle,
  BaseCardContext,
  BaseCardStateGraph,
  BaseCardStateMachine,
} from "../../components/basecardlifecycle";

export const cardId = "azure_subscription_v2" as const;

declare module "../../appContext" {
  interface SharedCardDataById {
    [cardId]: {
      azureSubscription: Readonly<{ id: string; displayName: string; tenantId: string }> | null;
    };
  }
}

export const azureLoginCardId = "azure_login_v2" satisfies BaseCardContext["cardId"];
export const repoCardId = "repo_v2" satisfies BaseCardContext["cardId"];
export const githubLoginCardId = "github_login_v2" satisfies BaseCardContext["cardId"];

export const initialCardContext = {
  cardId,
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
    transitions: ["blocked", "loading", "unsaved", "saved", "error"],
  },
  // Picked, but GitHub holds a different tenant or subscription (or none) until it is saved.
  unsaved: {
    label: "Unsaved change",
    baseCardLifecycle: "commit",
    transitions: ["blocked", "loading", "selecting", "saved", "error"],
  },
  saved: {
    label: "Saved to GitHub",
    baseCardLifecycle: "complete",
    transitions: ["blocked", "loading", "selecting", "unsaved", "error"],
  },
  // No subscriptions, or the list could not load; a new tenant or sign-in loads it again.
  error: {
    label: "No subscriptions",
    baseCardLifecycle: "error",
    transitions: ["blocked", "loading", "selecting", "unsaved", "saved"],
  },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export type State = {
  lifecycle: Lifecycle;
  scopeKey: string | null;
  selectedSubscriptionId: string;
  populateCount: number;
};

export type Event =
  | { type: "scope-synced"; scopeKey: string | null; selectedSubscriptionId: string }
  | { type: "subscription-selected"; subscriptionId: string }
  | { type: "transition"; lifecycle: Lifecycle };

export const initialState: State = {
  lifecycle: "blocked",
  scopeKey: null,
  selectedSubscriptionId: "",
  populateCount: 0,
};

export function toBaseCardLifecycle(state: Lifecycle): BaseCardLifecycle {
  return stateGraph[state].baseCardLifecycle;
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
  if (event.type === "scope-synced") {
    if (state.scopeKey === event.scopeKey && state.selectedSubscriptionId === event.selectedSubscriptionId) return state;
    return { ...state, scopeKey: event.scopeKey, selectedSubscriptionId: event.selectedSubscriptionId };
  }
  if (event.type === "subscription-selected") {
    return {
      ...state,
      selectedSubscriptionId: event.subscriptionId,
      populateCount: state.populateCount + 1,
    };
  }
  if (!canTransition(state, event.lifecycle)) {
    throw new Error(`Cannot transition from ${state.lifecycle} to ${event.lifecycle}`);
  }
  if (event.lifecycle === state.lifecycle) return state;
  return { ...state, lifecycle: event.lifecycle };
}

export const stateMachine: BaseCardStateMachine<Lifecycle> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};
