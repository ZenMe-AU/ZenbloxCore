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
    azure_app_registration_v2: {
      azureClientId: string | null;
    };
  }
}

export const azureLoginCardId = "azure_login_v2" satisfies CardId;
export const repoCardId = "repo_v2" satisfies CardId;
export const subscriptionCardId = "azure_subscription_v2" satisfies CardId;
export const githubLoginCardId = "github_login_v2" satisfies CardId;

export const initialCardContext = {
  cardId: "azure_app_registration_v2",
  title: "GitHub App Registration 2",
  prerequisiteIds: [azureLoginCardId, repoCardId, subscriptionCardId],
} satisfies Omit<BaseCardContext, "lifecycle">;

export type Lifecycle = "blocked" | "loading" | "ready" | "running" | "unsaved" | "complete" | "error";

// The lifecycle is derived after React batches updates, and the cards it waits for, the live checks and the
// GitHub variables can all change under it, so every state can reach every other: even ready → unsaved, when
// switching back to the environment a run was made for finds GitHub holding something else.
export const stateGraph = {
  blocked: {
    label: "Waiting for Azure login 2, Repository & environment 2 and Azure subscription 2",
    baseCardLifecycle: "blocked",
    transitions: ["loading", "ready", "running", "unsaved", "complete", "error"],
  },
  // Checking Azure access, the app's service principal and its role, or loading the GitHub variables.
  loading: {
    label: "Checking app registration",
    baseCardLifecycle: "loading",
    transitions: ["blocked", "ready", "running", "unsaved", "complete", "error"],
  },
  // Nothing saved yet, or what's saved no longer works here: not in this tenant, missing its role, or drifted.
  ready: {
    label: "Create app registration",
    baseCardLifecycle: "ready",
    transitions: ["blocked", "loading", "running", "unsaved", "complete", "error"],
  },
  running: {
    label: "Creating app registration",
    baseCardLifecycle: "action",
    transitions: ["blocked", "loading", "ready", "unsaved", "complete", "error"],
  },
  // The run made the app, but GitHub doesn't hold its client id yet.
  unsaved: {
    label: "Unsaved change",
    baseCardLifecycle: "commit",
    transitions: ["blocked", "loading", "ready", "running", "complete", "error"],
  },
  complete: {
    label: "App registration ready",
    baseCardLifecycle: "complete",
    transitions: ["blocked", "loading", "ready", "running", "unsaved", "error"],
  },
  // A step failed, or Azure access or the app's role couldn't be checked.
  error: {
    label: "Error",
    baseCardLifecycle: "error",
    transitions: ["blocked", "loading", "ready", "running", "unsaved", "complete"],
  },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export type State = BaseCardState<Lifecycle>;

export type Event = BaseCardEvent<Lifecycle>;

export const initialState: State = { lifecycle: "blocked" };

export function toBaseCardLifecycle(state: Lifecycle): BaseCardLifecycle {
  return stateGraph[state].baseCardLifecycle;
}

// Everything the app registration is made for, once Azure login 2, Repository & environment 2 and
// Azure subscription 2 are complete and GitHub login 2 has a token to save with.
export function getPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: BaseCardContext,
) {
  if (checkPrerequisites(appContext, baseCardContext).length > 0) return null;
  const azureLogin = appContext.cards[azureLoginCardId];
  const repo = appContext.cards[repoCardId];
  const subscription = appContext.cards[subscriptionCardId];
  const githubLogin = appContext.cards[githubLoginCardId];
  if (!azureLogin?.initialised || !repo?.initialised || !subscription?.initialised || !githubLogin?.initialised) return null;
  if (githubLogin.currentBaseCardStatus !== "complete") return null;
  if (!azureLogin.azureAccount || !azureLogin.azureTenantId || !subscription.azureSubscription) return null;
  if (!repo.githubRepository || !githubLogin.githubToken) return null;
  return {
    account: azureLogin.azureAccount,
    tenantId: azureLogin.azureTenantId,
    subscription: subscription.azureSubscription,
    githubRepository: repo.githubRepository,
  };
}

export function deriveLifecycle({
  prerequisitesMet,
  running,
  checking,
  failed,
  unsaved,
  verified,
}: {
  prerequisitesMet: boolean;
  running: boolean;
  checking: boolean;
  failed: boolean;
  unsaved: boolean; // A run made the app, but GitHub doesn't hold its client id.
  verified: boolean; // GitHub holds the client id, and the app has its role on the subscription.
}): Lifecycle {
  if (!prerequisitesMet) return "blocked";
  if (running) return "running";
  if (checking) return "loading";
  if (failed) return "error";
  if (unsaved) return "unsaved";
  return verified ? "complete" : "ready";
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
