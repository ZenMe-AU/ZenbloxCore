/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import {
  canCardTransition,
  cardLifecycleReducer,
  initialCardLifecycle,
  type CardLifecycle,
  type CardLifecycleEvent,
} from "../../components/basecardlifecycle";
import type { BaseCardContext } from "../../components/BaseCard";

export const initialState: ProtoState = {
  baseCardContext: {
    cardId: "proto_card",
    title: "ProtoCard prototype card",
    ...initialCardLifecycle,
  },
  protoCardContext: {
    forceUnlocked: false,
    prerequisiteIds: ["", ""],
    unmetCardPrerequisites: [],
  },
};

type ProtoCardContext = {
  forceUnlocked: boolean;
  prerequisiteIds: [string, string];
  unmetCardPrerequisites: string[];
};

export type ProtoState = {
  baseCardContext: BaseCardContext;
  protoCardContext: ProtoCardContext;
};

export type ProtoEvent =
  | { type: "card-prerequisite"; index: 0 | 1; cardId: string }
  | { type: "sync-card-prerequisites"; unmet: string[] }
  | { type: "force-unlock"; value: boolean }
  | { type: "check-prerequisites" }
  | CardLifecycleEvent;

export function getBaseCardContext(state: ProtoState) {
  const summary = state.baseCardContext.lifecycle === "loading"
    ? "Checking prerequisites..."
    : state.baseCardContext.lifecycle === "blocked"
      ? `Blocked: ${state.protoCardContext.unmetCardPrerequisites.join(", ")}`
      : "Summary";
  return {
    ...state.baseCardContext,
    summary,
    unmetCardPrerequisites: state.protoCardContext.unmetCardPrerequisites,
    done: state.protoCardContext.unmetCardPrerequisites.length === 0 && state.baseCardContext.lifecycle === "complete",
  } as const;
}

export function canTransition(state: ProtoState, lifecycle: CardLifecycle): boolean {
  return lifecycle !== "ready" && lifecycle !== "blocked"
    && state.protoCardContext.unmetCardPrerequisites.length === 0
    && canCardTransition(state.baseCardContext, lifecycle);
}

export function protoReducer(state: ProtoState, event: ProtoEvent): ProtoState {
  switch (event.type) {
    case "card-prerequisite": {
      const prerequisiteIds: [string, string] = [...state.protoCardContext.prerequisiteIds];
      prerequisiteIds[event.index] = event.cardId;
      return {
        ...state,
        protoCardContext: { ...state.protoCardContext, prerequisiteIds },
        baseCardContext: { ...state.baseCardContext, ...initialCardLifecycle },
      };
    }
    case "sync-card-prerequisites":
      return {
        ...state,
        protoCardContext: { ...state.protoCardContext, unmetCardPrerequisites: event.unmet },
        baseCardContext: { ...state.baseCardContext, ...initialCardLifecycle },
      };
    case "force-unlock":
      return { ...state, protoCardContext: { ...state.protoCardContext, forceUnlocked: event.value } };
    case "check-prerequisites":
      if (state.baseCardContext.lifecycle !== "loading") return state;
      return {
        ...state,
        baseCardContext: cardLifecycleReducer(state.baseCardContext, {
          type: "transition",
          lifecycle: state.protoCardContext.unmetCardPrerequisites.length === 0 ? "ready" : "blocked",
        }),
      };
    case "transition":
      if (!canTransition(state, event.lifecycle)) {
        throw new Error(`Cannot transition from ${state.baseCardContext.lifecycle} to ${event.lifecycle} with the current prerequisites`);
      }
      return { ...state, baseCardContext: cardLifecycleReducer(state.baseCardContext, event) };
  }
}
