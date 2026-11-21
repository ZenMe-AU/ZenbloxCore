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

export const requirements = {
  azure_login: "Azure login",
  repo: "Repository and environment",
  azure_subscription: "Azure subscription",
  azure_app_registration: "Azure app registration",
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
  cardContext: CardLifecycleContext;
  protoCardContext: ProtoCardContext;
};

export type ProtoEvent =
  | { type: "configuration"; configured: boolean }
  | { type: "requirement"; id: RequirementId; completed: boolean }
  | { type: "force-unlock"; value: boolean }
  | CardLifecycleEvent;

export const initialState: ProtoState = {
  appContext: {
    configured: true,
    completed: {
      azure_login: true,
      repo: true,
      azure_subscription: true,
      azure_app_registration: true,
    },
  },
  cardContext: initialCardLifecycle,
  protoCardContext: { forceUnlocked: false },
};

export function getCardContext(state: ProtoState) {
  const unmetRequirements = (Object.keys(requirements) as RequirementId[])
    .filter((id) => !state.appContext.completed[id]);
  const availability = !state.appContext.configured
    ? "unavailable"
    : unmetRequirements.length > 0 ? "locked" : "available";
  const status = availability === "unavailable"
    ? "unavailable"
    : availability === "locked" || state.cardContext.lifecycle === "blocked" ? "idle" : state.cardContext.lifecycle;
  return {
    lifecycle: state.cardContext.lifecycle,
    availability,
    unmetRequirements,
    status,
    done: availability === "available" && state.cardContext.lifecycle === "complete",
  } as const;
}

export function canTransition(state: ProtoState, lifecycle: CardLifecycle): boolean {
  return getCardContext(state).availability === "available"
    && canCardTransition(state.cardContext, lifecycle);
}

export function protoReducer(state: ProtoState, event: ProtoEvent): ProtoState {
  switch (event.type) {
    case "configuration":
      return { ...state, appContext: { ...state.appContext, configured: event.configured } };
    case "requirement":
      return {
        ...state,
        appContext: {
          ...state.appContext,
          completed: { ...state.appContext.completed, [event.id]: event.completed },
        },
      };
    case "force-unlock":
      return { ...state, protoCardContext: { ...state.protoCardContext, forceUnlocked: event.value } };
    case "transition":
      if (!canTransition(state, event.lifecycle)) {
        throw new Error(`Cannot transition from ${state.cardContext.lifecycle} to ${event.lifecycle} while ${getCardContext(state).availability}`);
      }
      return { ...state, cardContext: cardLifecycleReducer(state.cardContext, event) };
  }
}
