/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import {
  canCardTransition,
  cardLifecycleReducer,
  initialCardLifecycle,
  type CardLifecycle,
  type CardLifecycleContext,
  type CardLifecycleEvent,
} from "../../components/cardLifecycle";
import type { CardId } from "../../types";

export const initialState: ProtoState = {
  baseCardContext: {
    cardId: "proto_card",
    title: "ProtoCard prototype card",
    ...initialCardLifecycle,
  },
  appContext: {
    configured: true,
    completed: {
      xxx: true,
    },
  },
  protoCardContext: { forceUnlocked: false },
};

export const requirements = {
  xxx: "requirement xxx",
} as const;

export type RequirementId = keyof typeof requirements;
type AppContext = {
  configured: boolean;
  completed: Record<RequirementId, boolean>;
};

type ProtoCardContext = {
  forceUnlocked: boolean;
};

export type ProtoState = {
  appContext: AppContext;
  baseCardContext: CardLifecycleContext & { cardId: CardId; title: string };
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
    .filter((id) => !state.appContext.completed[id]);
  const summary = state.baseCardContext.lifecycle === "loading"
    ? "Checking prerequisites..."
    : !state.appContext.configured
      ? "Configuration unavailable"
      : state.baseCardContext.lifecycle === "blocked"
        ? `Blocked: ${unmetRequirements.map((id) => requirements[id]).join(", ")}`
        : "Summary";
  return {
    ...state.baseCardContext,
    summary,
    unmetRequirements,
    done: state.appContext.configured && unmetRequirements.length === 0 && state.baseCardContext.lifecycle === "complete",
  } as const;
}

export function canTransition(state: ProtoState, lifecycle: CardLifecycle): boolean {
  return lifecycle !== "ready" && lifecycle !== "blocked"
    && state.appContext.configured && getBaseCardContext(state).unmetRequirements.length === 0
    && canCardTransition(state.baseCardContext, lifecycle);
}

export function protoReducer(state: ProtoState, event: ProtoEvent): ProtoState {
  switch (event.type) {
    case "configuration":
      return {
        ...state,
        appContext: { ...state.appContext, configured: event.configured },
        baseCardContext: { ...state.baseCardContext, ...initialCardLifecycle },
      };
    case "requirement":
      return {
        ...state,
        appContext: {
          ...state.appContext,
          completed: { ...state.appContext.completed, [event.id]: event.completed },
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
          lifecycle: state.appContext.configured && getBaseCardContext(state).unmetRequirements.length === 0 ? "ready" : "blocked",
        }),
      };
    case "transition":
      if (!canTransition(state, event.lifecycle)) {
        throw new Error(`Cannot transition from ${state.baseCardContext.lifecycle} to ${event.lifecycle} with the current prerequisites`);
      }
      return { ...state, baseCardContext: cardLifecycleReducer(state.baseCardContext, event) };
  }
}
