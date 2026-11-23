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
import type { AzureAccount } from "../../types";

type AzureLoginIdentity = Pick<AzureAccount, "homeAccountId" | "environment" | "tenantId" | "localAccountId" | "username">;

declare module "../../appContext" {
  interface SharedCardDataById {
    azure_login_v2: {
      azureAccount: Readonly<AzureLoginIdentity> | null;
      azureTenantId: string | null;
    };
  }
}

export type Lifecycle =
  | "loading"
  | "unconfigured"
  | "signed-out"
  | "signing-in"
  | "selecting-tenant"
  | "confirming-tenant"
  | "tenant-confirmed"
  | "error";

// The lifecycle is derived after React batches updates, so a fast reply can skip signing-in or
// confirming-tenant; the edges that skip them are listed too, or the reducer would throw mid-render.
export const stateGraph = {
  loading: {
    label: "Checking session",
    baseCardLifecycle: "loading",
    transitions: ["unconfigured", "signed-out", "selecting-tenant", "tenant-confirmed"],
  },
  // No VITE_AZURE_CLIENT_ID: fixed at build time, so nothing leaves this state.
  unconfigured: {
    label: "Not configured",
    baseCardLifecycle: "blocked",
    transitions: [],
  },
  "signed-out": {
    label: "Signed out",
    baseCardLifecycle: "ready",
    transitions: ["signing-in", "error"],
  },
  "signing-in": {
    label: "Signing in",
    baseCardLifecycle: "action",
    transitions: ["error"],
  },
  "selecting-tenant": {
    label: "Select a tenant",
    baseCardLifecycle: "action",
    transitions: ["confirming-tenant", "tenant-confirmed", "error", "signed-out"],
  },
  "confirming-tenant": {
    label: "Confirming tenant",
    baseCardLifecycle: "commit",
    transitions: ["selecting-tenant", "tenant-confirmed", "error"],
  },
  "tenant-confirmed": {
    label: "Tenant confirmed",
    baseCardLifecycle: "complete",
    transitions: ["confirming-tenant", "selecting-tenant", "error", "signed-out"],
  },
  error: {
    label: "Error",
    baseCardLifecycle: "error",
    transitions: ["signing-in", "confirming-tenant", "selecting-tenant", "tenant-confirmed", "signed-out"],
  },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export type State = BaseCardState<Lifecycle>;

export type Event = BaseCardEvent<Lifecycle>;

export const initialState: State = { lifecycle: "loading" };

export function toBaseCardLifecycle(state: Lifecycle): BaseCardLifecycle {
  return stateGraph[state].baseCardLifecycle;
}

// Read from the facts every render; the reducer then checks the step against the graph.
export function deriveLifecycle({
  configured,
  loggingIn,
  redirecting,
  account,
  confirming,
  loginError,
  tenantIdError,
  tenantId,
}: {
  configured: boolean;
  loggingIn: boolean;
  redirecting: boolean;
  account: unknown;
  confirming: boolean;
  loginError: string | null;
  tenantIdError: string | null;
  tenantId: string | null;
}): Lifecycle {
  if (!configured) return "unconfigured";
  if (loggingIn) return "loading";
  if (redirecting) return "signing-in";
  if (!account) return loginError ? "error" : "signed-out";
  if (confirming) return "confirming-tenant";
  // A failed pick wins over an earlier confirmed tenant: the tenant on screen is the one that failed.
  if (tenantIdError) return "error";
  return tenantId ? "tenant-confirmed" : "selecting-tenant";
}

export function canTransition(currentState: State, nextState: Lifecycle): boolean {
  return currentState.lifecycle === nextState
    || stateGraph[currentState.lifecycle].transitions.some((lifecycle) => lifecycle === nextState);
}

export function reducer(state: State, event: Event): State {
  if (!canTransition(state, event.lifecycle)) {
    throw new Error(`Cannot transition from ${state.lifecycle} to ${event.lifecycle}`);
  }
  if (event.lifecycle === state.lifecycle) return state;
  return { lifecycle: event.lifecycle };
}

export const stateMachine: BaseCardStateMachine<Lifecycle> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};
