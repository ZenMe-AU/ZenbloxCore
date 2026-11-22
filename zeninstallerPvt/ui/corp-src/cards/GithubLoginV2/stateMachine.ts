/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type {
  Lifecycle as BaseCardLifecycle,
  BaseCardEvent,
  BaseCardState,
  BaseCardStateGraph,
  BaseCardStateMachine,
} from "../../components/basecardlifecycle";

export const lifecycles = ["loading", "ready", "signing-in", "signed-in", "expired"] as const;
export type Lifecycle = typeof lifecycles[number];

export const stateGraph = {
  loading: {
    label: "Loading",
    baseCardLifecycle: "loading",
    transitions: ["ready", "signing-in", "signed-in", "expired"],
  },
  ready: {
    label: "Ready",
    baseCardLifecycle: "ready",
    transitions: ["signing-in"],
  },
  "signing-in": {
    label: "Signing in",
    baseCardLifecycle: "action",
    transitions: ["ready", "signed-in", "expired"],
  },
  "signed-in": {
    label: "Signed in",
    baseCardLifecycle: "complete",
    transitions: ["ready", "signing-in", "expired"],
  },
  expired: {
    label: "Session expired",
    baseCardLifecycle: "error",
    transitions: ["ready", "signing-in"],
  },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export type State = BaseCardState<Lifecycle>;

export type Event = BaseCardEvent<Lifecycle>;

export const initialState: State = { lifecycle: "loading" };

export function toBaseCardLifecycle(lifecycle: Lifecycle): BaseCardLifecycle {
  return stateGraph[lifecycle].baseCardLifecycle;
}

export function deriveLifecycle({
  redirecting,
  verifying,
  loggingIn,
  account,
  sessionExpired,
}: {
  redirecting: "login" | "logout" | null;
  verifying: boolean;
  loggingIn: boolean;
  account: unknown;
  sessionExpired: boolean;
}): Lifecycle {
  return redirecting === "login" || verifying
    ? "signing-in"
    : loggingIn ? "loading" : account ? "signed-in" : sessionExpired ? "expired" : "ready";
}

export function reducer(state: State, event: Event): State {
  if (event.lifecycle === state.lifecycle) return state;
  if (!stateGraph[state.lifecycle].transitions.some((lifecycle) => lifecycle === event.lifecycle)) {
    throw new Error(`Cannot transition from ${state.lifecycle} to ${event.lifecycle}`);
  }
  return { lifecycle: event.lifecycle };
}

export const stateMachine: BaseCardStateMachine<Lifecycle> = {
  graph: stateGraph,
  initialState,
  reducer,
  toBaseCardLifecycle,
};