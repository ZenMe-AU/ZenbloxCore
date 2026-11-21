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
  baseCardContext: CardLifecycleContext;
  protoCardContext: ProtoCardContext;
};

export type ProtoEvent =
  | { type: "configuration"; configured: boolean }
  | { type: "requirement"; id: RequirementId; completed: boolean }
  | { type: "force-unlock"; value: boolean }
  | { type: "check-prerequisites" }
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
  baseCardContext: initialCardLifecycle,
  protoCardContext: { forceUnlocked: false },
};

export function getBaseCardContext(state: ProtoState) {
  const unmetRequirements = (Object.keys(requirements) as RequirementId[])
    .filter((id) => !state.appContext.completed[id]);
  return {
    lifecycle: state.baseCardContext.lifecycle,
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
        baseCardContext: initialCardLifecycle,
      };
    case "requirement":
      return {
        ...state,
        appContext: {
          ...state.appContext,
          completed: { ...state.appContext.completed, [event.id]: event.completed },
        },
        baseCardContext: initialCardLifecycle,
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
