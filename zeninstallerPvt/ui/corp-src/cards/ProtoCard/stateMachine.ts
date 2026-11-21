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
    configured: true,
    completed: {
      xxx: true,
    },
  },
};

export const requirements = {
  xxx: "requirement xxx",
} as const;

export type RequirementId = keyof typeof requirements;
type ProtoCardContext = {
  forceUnlocked: boolean;
  configured: boolean;
  completed: Record<RequirementId, boolean>;
};

export type ProtoState = {
  baseCardContext: BaseCardContext;
  protoCardContext: ProtoCardContext;
};

export type ProtoEvent =
  | { type: "configuration"; configured: boolean }
  | { type: "requirement"; id: RequirementId; completed: boolean }
  | { type: "force-unlock"; value: boolean }
  | { type: "check-prerequisites" }
  | CardLifecycleEvent;

export function getBaseCardContext(state: ProtoState) {
  const unmetRequirements = (Object.keys(requirements) as RequirementId[])
    .filter((id) => !state.protoCardContext.completed[id]);
  const summary = state.baseCardContext.lifecycle === "loading"
    ? "Checking prerequisites..."
    : !state.protoCardContext.configured
      ? "Configuration unavailable"
      : state.baseCardContext.lifecycle === "blocked"
        ? `Blocked: ${unmetRequirements.map((id) => requirements[id]).join(", ")}`
        : "Summary";
  return {
    ...state.baseCardContext,
    summary,
    unmetRequirements,
    done: state.protoCardContext.configured && unmetRequirements.length === 0 && state.baseCardContext.lifecycle === "complete",
  } as const;
}

export function canTransition(state: ProtoState, lifecycle: CardLifecycle): boolean {
  return lifecycle !== "ready" && lifecycle !== "blocked"
    && state.protoCardContext.configured && getBaseCardContext(state).unmetRequirements.length === 0
    && canCardTransition(state.baseCardContext, lifecycle);
}

export function protoReducer(state: ProtoState, event: ProtoEvent): ProtoState {
  switch (event.type) {
    case "configuration":
      return {
        ...state,
        protoCardContext: { ...state.protoCardContext, configured: event.configured },
        baseCardContext: { ...state.baseCardContext, ...initialCardLifecycle },
      };
    case "requirement":
      return {
        ...state,
        protoCardContext: {
          ...state.protoCardContext,
          completed: { ...state.protoCardContext.completed, [event.id]: event.completed },
        },
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
          lifecycle: state.protoCardContext.configured && getBaseCardContext(state).unmetRequirements.length === 0 ? "ready" : "blocked",
        }),
      };
    case "transition":
      if (!canTransition(state, event.lifecycle)) {
        throw new Error(`Cannot transition from ${state.baseCardContext.lifecycle} to ${event.lifecycle} with the current prerequisites`);
      }
      return { ...state, baseCardContext: cardLifecycleReducer(state.baseCardContext, event) };
  }
}
