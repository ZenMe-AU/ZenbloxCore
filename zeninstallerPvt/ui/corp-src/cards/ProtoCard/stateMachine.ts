/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export const requirements = {
  azure_login: "Azure login",
  repo: "Repository and environment",
  azure_subscription: "Azure subscription",
  azure_app_registration: "Azure app registration",
} as const;

export type RequirementId = keyof typeof requirements;
export type Lifecycle = "idle" | "loading" | "complete" | "warning" | "error" | "skipped";

type AppContext = {
  configured: boolean;
  completed: Record<RequirementId, boolean>;
};

type ProtoCardContext = {
  lifecycle: Lifecycle;
};

export type ProtoState = {
  appContext: AppContext;
  protoCardContext: ProtoCardContext;
};

export type ProtoEvent =
  | { type: "configuration"; configured: boolean }
  | { type: "requirement"; id: RequirementId; completed: boolean }
  | { type: "transition"; lifecycle: Lifecycle };

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
  protoCardContext: { lifecycle: "idle" },
};

const transitions: Record<Lifecycle, readonly Lifecycle[]> = {
  idle: ["loading", "skipped"],
  loading: ["complete", "warning", "error", "idle"],
  complete: ["loading", "idle"],
  warning: ["loading", "idle", "skipped"],
  error: ["loading", "idle"],
  skipped: ["idle"],
};

export function getCardContext(state: ProtoState) {
  const unmetRequirements = (Object.keys(requirements) as RequirementId[])
    .filter((id) => !state.appContext.completed[id]);
  const availability = !state.appContext.configured
    ? "unavailable"
    : unmetRequirements.length > 0 ? "locked" : "available";
  const status = availability === "unavailable"
    ? "unavailable"
    : availability === "locked" ? "idle" : state.protoCardContext.lifecycle;
  return {
    availability,
    unmetRequirements,
    status,
    done: availability === "available" && state.protoCardContext.lifecycle === "complete",
  } as const;
}

export function canTransition(state: ProtoState, lifecycle: Lifecycle): boolean {
  return getCardContext(state).availability === "available"
    && transitions[state.protoCardContext.lifecycle].includes(lifecycle);
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
    case "transition":
      if (!canTransition(state, event.lifecycle)) {
        throw new Error(`Cannot transition from ${state.protoCardContext.lifecycle} to ${event.lifecycle} while ${getCardContext(state).availability}`);
      }
      return { ...state, protoCardContext: { lifecycle: event.lifecycle } };
  }
}
