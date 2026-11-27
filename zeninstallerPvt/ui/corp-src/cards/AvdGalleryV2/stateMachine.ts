/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContextCardId } from "../../appContext";
import type {
  BaseCardContext,
  BaseCardState,
  BaseCardStateGraph,
  BaseCardStateMachine,
  Lifecycle as BaseCardLifecycle,
} from "../../components/basecardlifecycle";
import { coreInfraAppContextId } from "../CoreInfra/useCoreInfraCard";
import { AVD_GALLERY_V2_TITLE } from "./config";

export const cardId = "avd_gallery_v2" as const;

declare module "../../appContext" {
  interface SharedCardDataById {
    [cardId]: Record<never, never>;
  }
}

export const githubLoginCardId = "github_login_v2" satisfies BaseCardContext["cardId"];
export const repoCardId = "repo_v2" satisfies BaseCardContext["cardId"];
export const coreInfraCardId = coreInfraAppContextId satisfies BaseCardContext["cardId"];

export const initialCardContext = {
  cardId,
  title: AVD_GALLERY_V2_TITLE,
  prerequisiteIds: [githubLoginCardId, repoCardId, coreInfraCardId],
} satisfies Omit<BaseCardContext, "lifecycle">;

export type Lifecycle = "loading" | "blocked" | "ready" | "action" | "complete" | "error";

export type State = BaseCardState<Lifecycle> & {
  baseCardContext: Omit<BaseCardContext<Lifecycle>, "lifecycle"> & {
    unmetCardPrerequisites: AppContextCardId[];
  };
};

export type Event = {
  type: "sync";
  lifecycle: Lifecycle;
  unmetCardPrerequisites: AppContextCardId[];
};

export const stateGraph = {
  loading: { label: "Loading deployment status", baseCardLifecycle: "loading", transitions: ["blocked", "ready", "action", "complete", "error"] },
  blocked: { label: "Waiting for GitHub login 2, repository 2 and Terraform state backend", baseCardLifecycle: "blocked", transitions: ["loading", "ready", "action", "complete", "error"] },
  ready: { label: "Ready to deploy", baseCardLifecycle: "ready", transitions: ["loading", "blocked", "action", "complete", "error"] },
  action: { label: "Deploying image gallery", baseCardLifecycle: "action", transitions: ["loading", "blocked", "ready", "complete", "error"] },
  complete: { label: "Image gallery deployed", baseCardLifecycle: "complete", transitions: ["loading", "blocked", "ready", "action", "error"] },
  error: { label: "Deployment failed", baseCardLifecycle: "error", transitions: ["loading", "blocked", "ready", "action", "complete"] },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export const initialState: State = {
  lifecycle: "loading",
  baseCardContext: {
    ...initialCardContext,
    unmetCardPrerequisites: [githubLoginCardId, repoCardId, coreInfraCardId],
  },
};

export function toBaseCardLifecycle(lifecycle: Lifecycle): BaseCardLifecycle {
  return stateGraph[lifecycle].baseCardLifecycle;
}

export function canTransition(state: State, lifecycle: Lifecycle): boolean {
  return state.lifecycle === lifecycle || stateGraph[state.lifecycle].transitions.some((target) => target === lifecycle);
}

export function reducer(state: State, event: Event): State {
  if (!canTransition(state, event.lifecycle)) {
    throw new Error(`Cannot transition from ${state.lifecycle} to ${event.lifecycle}`);
  }
  const samePrerequisites = state.baseCardContext.unmetCardPrerequisites.length === event.unmetCardPrerequisites.length
    && state.baseCardContext.unmetCardPrerequisites.every((id, index) => id === event.unmetCardPrerequisites[index]);
  if (state.lifecycle === event.lifecycle && samePrerequisites) return state;
  return {
    ...state,
    lifecycle: event.lifecycle,
    baseCardContext: { ...state.baseCardContext, unmetCardPrerequisites: [...event.unmetCardPrerequisites] },
  };
}

export function getBaseCardContext(state: State, summary: string) {
  return {
    ...state.baseCardContext,
    lifecycle: toBaseCardLifecycle(state.lifecycle),
    summary,
    done: state.lifecycle === "complete" && state.baseCardContext.unmetCardPrerequisites.length === 0,
    stateMachine: { graph: stateGraph, currentState: state.lifecycle },
  } as const;
}

export const stateMachine: BaseCardStateMachine<Lifecycle, State, Event> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};
