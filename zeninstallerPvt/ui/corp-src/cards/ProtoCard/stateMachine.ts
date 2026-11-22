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
  privateContext: PrivateContext;
};

type PrivateContext = {
  forceUnlocked: boolean;
  unmetCardPrerequisites: string[];
};

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
  | { type: "force-unlock"; value: boolean }
  | { type: "check-prerequisites" }
  | { type: "transition"; lifecycle: Lifecycle };

export const initialState: State = {
  lifecycle: "loading",
  baseCardContext: {
    cardId: "proto_card",
    title,
    prerequisiteIds: ["", ""],
  },
  privateContext: {
    forceUnlocked: false,
    unmetCardPrerequisites: [],
  },
};

export function getBaseCardContext(state: State) {
  const lifecycle = state.lifecycle;
  return {
    ...state.baseCardContext,
    lifecycle,
    stateMachine: { graph: stateGraph, currentState: lifecycle },
    summary: summaryFor(lifecycle, state.privateContext.unmetCardPrerequisites),
    unmetCardPrerequisites: state.privateContext.unmetCardPrerequisites,
    done: state.privateContext.unmetCardPrerequisites.length === 0 && lifecycle === "complete",
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

export function canTransition(currentState: Pick<State, "lifecycle" | "privateContext">, nextState: Lifecycle): boolean {
  return nextState !== "ready" && nextState !== "blocked"
    && currentState.privateContext.unmetCardPrerequisites.length === 0
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
        privateContext: { ...state.privateContext, unmetCardPrerequisites: event.unmet },
        lifecycle: "loading",
      };
    case "force-unlock":
      return { ...state, privateContext: { ...state.privateContext, forceUnlocked: event.value } };
    case "check-prerequisites": {
      if (state.lifecycle !== "loading") return state;
      const lifecycle = state.privateContext.unmetCardPrerequisites.length === 0 ? "ready" : "blocked";
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
