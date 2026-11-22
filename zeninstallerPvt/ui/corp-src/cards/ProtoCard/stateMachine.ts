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

export type State = BaseCardState<Lifecycle> & {
  baseCardContext: Omit<BaseCardContext, "lifecycle" | "prerequisiteIds"> & { prerequisiteIds: [string, string] };
  protoCardContext: ProtoCardContext;
};

type ProtoCardContext = {
  forceUnlocked: boolean;
  unmetCardPrerequisites: string[];
};

export type Event =
  | { type: "card-prerequisite"; index: 0 | 1; cardId: string }
  | { type: "sync-card-prerequisites"; unmet: string[] }
  | { type: "force-unlock"; value: boolean }
  | { type: "check-prerequisites" }
  | { type: "transition"; lifecycle: Lifecycle };

export const initialState: State = {
  lifecycle: "loading",
  baseCardContext: {
    cardId: "proto_card",
    title: "ProtoCard prototype card",
    prerequisiteIds: ["", ""],
  },
  protoCardContext: {
    forceUnlocked: false,
    unmetCardPrerequisites: [],
  },
};

export function getBaseCardContext(state: State) {
  const lifecycle = state.lifecycle;
  const summary = lifecycle === "loading"
    ? "Checking prerequisites..."
    : lifecycle === "blocked"
      ? `Blocked: ${state.protoCardContext.unmetCardPrerequisites.join(", ")}`
      : "Summary";
  return {
    ...state.baseCardContext,
    lifecycle,
    summary,
    unmetCardPrerequisites: state.protoCardContext.unmetCardPrerequisites,
    done: state.protoCardContext.unmetCardPrerequisites.length === 0 && lifecycle === "complete",
  } as const;
}

export const stateGraph: BaseCardStateGraph<Lifecycle> = {
  blocked: { label: "Blocked", baseCardLifecycle: "blocked", transitions: ["loading"] },
  loading: { label: "Loading", baseCardLifecycle: "loading", transitions: ["ready", "action", "commit", "blocked"] },
  ready: { label: "Ready", baseCardLifecycle: "ready", transitions: ["action", "error"] },
  action: { label: "Action", baseCardLifecycle: "action", transitions: ["commit", "error"] },
  commit: { label: "Commit", baseCardLifecycle: "commit", transitions: ["complete", "error"] },
  complete: { label: "Complete", baseCardLifecycle: "complete", transitions: ["loading"] },
  error: { label: "Error", baseCardLifecycle: "error", transitions: ["loading"] },
};

export function canLifecycleTransition(from: Lifecycle, to: Lifecycle): boolean {
  return stateGraph[from].transitions.includes(to);
}

export function canTransition(currentState: Pick<State, "lifecycle" | "protoCardContext">, nextState: Lifecycle): boolean {
  return nextState !== "ready" && nextState !== "blocked"
    && currentState.protoCardContext.unmetCardPrerequisites.length === 0
    && canLifecycleTransition(currentState.lifecycle, nextState);
}

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case "card-prerequisite": {
      const prerequisiteIds: [string, string] = [...state.baseCardContext.prerequisiteIds];
      prerequisiteIds[event.index] = event.cardId;
      return {
        ...state,
        baseCardContext: { ...state.baseCardContext, prerequisiteIds },
        lifecycle: "loading",
      };
    }
    case "sync-card-prerequisites":
      return {
        ...state,
        protoCardContext: { ...state.protoCardContext, unmetCardPrerequisites: event.unmet },
        lifecycle: "loading",
      };
    case "force-unlock":
      return { ...state, protoCardContext: { ...state.protoCardContext, forceUnlocked: event.value } };
    case "check-prerequisites": {
      if (state.lifecycle !== "loading") return state;
      const lifecycle = state.protoCardContext.unmetCardPrerequisites.length === 0 ? "ready" : "blocked";
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
