/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import {
  canTransition as basecard_canTransition,
  lifecycleReducer,
  initialLifecycle,
  type LifecycleState,
  type Lifecycle,
  type LifecycleEvent,
} from "../../components/useBaseCard";
import type { BaseCardContext } from "../../components/useBaseCard";

export type State = {
  lifecycle: LifecycleState;
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
  | LifecycleEvent;

export const initialState: State = {
  lifecycle: { context: initialLifecycle },
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
  const lifecycle = state.lifecycle.context.lifecycle;
  const summary = lifecycle === "loading"
    ? "Checking prerequisites..."
    : lifecycle === "blocked"
      ? `Blocked: ${state.protoCardContext.unmetCardPrerequisites.join(", ")}`
      : "Summary";
  return {
    ...state.baseCardContext,
    ...state.lifecycle.context,
    summary,
    unmetCardPrerequisites: state.protoCardContext.unmetCardPrerequisites,
    done: state.protoCardContext.unmetCardPrerequisites.length === 0 && lifecycle === "complete",
  } as const;
}

export function canTransition(state: Pick<State, "lifecycle" | "protoCardContext">, lifecycle: Lifecycle): boolean {
  return lifecycle !== "ready" && lifecycle !== "blocked"
    && state.protoCardContext.unmetCardPrerequisites.length === 0
    && basecard_canTransition(state.lifecycle.context, lifecycle);
}

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case "card-prerequisite": {
      const prerequisiteIds: [string, string] = [...state.baseCardContext.prerequisiteIds];
      prerequisiteIds[event.index] = event.cardId;
      return {
        ...state,
        baseCardContext: { ...state.baseCardContext, prerequisiteIds },
        lifecycle: { ...state.lifecycle, context: initialLifecycle },
      };
    }
    case "sync-card-prerequisites":
      return {
        ...state,
        protoCardContext: { ...state.protoCardContext, unmetCardPrerequisites: event.unmet },
        lifecycle: { ...state.lifecycle, context: initialLifecycle },
      };
    case "force-unlock":
      return { ...state, protoCardContext: { ...state.protoCardContext, forceUnlocked: event.value } };
    case "check-prerequisites":
      if (state.lifecycle.context.lifecycle !== "loading") return state;
      return {
        ...state,
        lifecycle: { ...state.lifecycle, context: lifecycleReducer(state.lifecycle.context, {
          type: "transition",
          lifecycle: state.protoCardContext.unmetCardPrerequisites.length === 0 ? "ready" : "blocked",
        }) },
      };
    case "transition":
      if (!canTransition(state, event.lifecycle)) {
        throw new Error(`Cannot transition from ${state.lifecycle.context.lifecycle} to ${event.lifecycle} with the current prerequisites`);
      }
      return { ...state, lifecycle: { ...state.lifecycle, context: lifecycleReducer(state.lifecycle.context, event) } };
  }
}
