/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type {
  BaseCardContext,
  BaseCardState,
  BaseCardStateGraph,
  BaseCardStateMachine,
  Lifecycle,
} from "../../components/basecardlifecycle";

declare module "../../appContext" {
  interface SharedCardDataById {
    proto_card: Record<never, never>;
  }
}

export type State = BaseCardState<Lifecycle> & {
  baseCardContext: Omit<BaseCardContext<Lifecycle>, "lifecycle"> & {
    unmetCardPrerequisites: string[];
  };
  privateContext: PrivateContext;
};

type PrivateContext = Record<never, never>;

const title = "ProtoCard prototype card";
const defaultSummary = "Ready to proceed";

function summaryFor(lifecycle: Lifecycle, unmetCardPrerequisites: readonly string[]): string {
  return lifecycle === "loading"
    ? "Checking prerequisites..."
    : lifecycle === "blocked"
      ? `Blocked due to incomplete prerequisites: ${unmetCardPrerequisites.join(", ")}`
      : defaultSummary;
}

export type Event =
  | { type: "card-prerequisite"; index: 0 | 1; cardId: string }
  | { type: "sync-card-prerequisites"; unmet: string[] }
  | { type: "check-prerequisites" }
  | { type: "transition"; lifecycle: Lifecycle };

export const initialState: State = {
  lifecycle: "loading",
  baseCardContext: {
    cardId: "proto_card",
    title,
    prerequisiteIds: ["", ""],
    unmetCardPrerequisites: [],
  },
  privateContext: {},
};

export function getBaseCardContext(state: State) {
  const lifecycle = state.lifecycle;
  const unmetCardPrerequisites = state.baseCardContext.unmetCardPrerequisites;
  return {
    ...state.baseCardContext,
    lifecycle,
    stateMachine: { graph: stateGraph, currentState: lifecycle },
    summary: summaryFor(lifecycle, unmetCardPrerequisites),
    done: unmetCardPrerequisites.length === 0 && lifecycle === "complete",
  } as const;
}

export const stateGraph: BaseCardStateGraph<Lifecycle> = {
  blocked: { label: "Blocked", baseCardLifecycle: "blocked", transitions: ["loading", "forceUnlocked"] },
  loading: { label: "Loading", baseCardLifecycle: "loading", transitions: ["ready", "action", "commit", "blocked"] },
  ready: { label: "Ready", baseCardLifecycle: "ready", transitions: ["action", "error"] },
  action: { label: "Action", baseCardLifecycle: "action", transitions: ["commit", "error"] },
  commit: { label: "Commit", baseCardLifecycle: "commit", transitions: ["complete", "error"] },
  complete: { label: "Complete", baseCardLifecycle: "complete", transitions: ["loading"] },
  error: { label: "Error", baseCardLifecycle: "error", transitions: ["loading"] },
  forceUnlocked: { label: "Force unlocked", baseCardLifecycle: "forceUnlocked", transitions: ["blocked"] },
};

export function canLifecycleTransition(from: Lifecycle, to: Lifecycle): boolean {
  return stateGraph[from].transitions.includes(to);
}

export function canTransition(currentState: Pick<State, "lifecycle" | "baseCardContext">, nextState: Lifecycle): boolean {
  if (!canLifecycleTransition(currentState.lifecycle, nextState)) return false;
  if (currentState.lifecycle === "blocked" && nextState === "forceUnlocked") return true;
  if (currentState.lifecycle === "forceUnlocked" && nextState === "blocked") return true;
  return nextState !== "ready" && nextState !== "blocked"
    && currentState.baseCardContext.unmetCardPrerequisites.length === 0;
}

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case "card-prerequisite": {
      return {
        ...state,
        baseCardContext: {
          ...state.baseCardContext,
          prerequisiteIds: state.baseCardContext.prerequisiteIds.map((cardId, index) => index === event.index ? event.cardId : cardId),
        },
        lifecycle: "loading",
      };
    }
    case "sync-card-prerequisites":
      return {
        ...state,
        baseCardContext: { ...state.baseCardContext, unmetCardPrerequisites: event.unmet },
        lifecycle: "loading",
      };
    case "check-prerequisites": {
      if (state.lifecycle !== "loading") return state;
      const lifecycle = state.baseCardContext.unmetCardPrerequisites.length === 0 ? "ready" : "blocked";
      if (!canLifecycleTransition(state.lifecycle, lifecycle)) return state;
      return {
        ...state,
        lifecycle,
      };
    }
    case "transition":
      if (!canTransition(state, event.lifecycle)) {
        throw new Error(`Cannot transition from ${state.lifecycle} to ${event.lifecycle} with the current prerequisites`);
      }
      return { ...state, lifecycle: event.lifecycle };
  }
}

export function toBaseCardLifecycle(state: Lifecycle): Lifecycle {
  return stateGraph[state].baseCardLifecycle;
}

export const stateMachine: BaseCardStateMachine<Lifecycle, State, Event> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};
