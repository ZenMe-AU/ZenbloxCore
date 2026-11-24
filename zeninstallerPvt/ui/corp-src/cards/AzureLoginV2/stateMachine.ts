/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type {
  Lifecycle as BaseCardLifecycle,
  BaseCardContext,
  BaseCardStateGraph,
  BaseCardStateMachine,
} from "../../components/basecardlifecycle";
import { tenantDisplayName } from "../../logic/tenant";
import type { AzureAccount, AzureTenant } from "../../types";

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

export const stateGraph = {
  loading: {
    label: "Checking session",
    baseCardLifecycle: "loading",
    transitions: ["unconfigured", "signed-out", "selecting-tenant", "tenant-confirmed"],
  },
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

export type State = {
  lifecycle: Lifecycle;
  baseCardContext: Omit<BaseCardContext<Lifecycle>, "lifecycle" | "summary" | "stateMachine">;
  account: AzureAccount | null;
  manualTenantId: string;
  confirmedTenantId: string | null;
  loginError: string | null;
  tenantIdError: string | null;
};

export type Event =
  | { type: "unconfigured" }
  | { type: "session-empty" }
  | { type: "session-restored"; account: AzureAccount; prefilledTenantId: string; confirmedTenantId: string | null }
  | { type: "login-requested" }
  | { type: "login-failed"; error: string }
  | { type: "manual-tenant-changed"; tenantId: string }
  | { type: "tenant-confirmation-started"; tenantId: string }
  | { type: "tenant-confirmed"; tenantId: string; account: AzureAccount }
  | { type: "tenant-confirmation-failed"; error: string }
  | { type: "tenant-consent-redirected" }
  | { type: "logout-completed" };

export const initialState: State = {
  lifecycle: "loading",
  baseCardContext: { cardId: "azure_login_v2", title: "Azure login 2", prerequisiteIds: [] },
  account: null,
  manualTenantId: "",
  confirmedTenantId: null,
  loginError: null,
  tenantIdError: null,
};

export function toBaseCardLifecycle(state: Lifecycle): BaseCardLifecycle {
  return stateGraph[state].baseCardLifecycle;
}

export function canTransition(currentState: State, nextState: Lifecycle): boolean {
  return currentState.lifecycle === nextState
    || stateGraph[currentState.lifecycle].transitions.some((lifecycle) => lifecycle === nextState);
}

function transition(state: State, lifecycle: Lifecycle, changes: Partial<State> = {}): State {
  if (!canTransition(state, lifecycle)) throw new Error(`Cannot transition from ${state.lifecycle} to ${lifecycle}`);
  return { ...state, ...changes, lifecycle };
}

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case "unconfigured":
      return transition(state, "unconfigured");
    case "session-empty":
      return transition(state, "signed-out", { account: null, loginError: null });
    case "session-restored":
      return transition(state, event.confirmedTenantId ? "tenant-confirmed" : "selecting-tenant", {
        account: event.account,
        manualTenantId: event.prefilledTenantId,
        confirmedTenantId: event.confirmedTenantId,
        loginError: null,
        tenantIdError: null,
      });
    case "login-requested":
      return transition(state, "signing-in", { loginError: null });
    case "login-failed":
      return transition(state, "error", { loginError: event.error });
    case "manual-tenant-changed":
      return { ...state, manualTenantId: event.tenantId, tenantIdError: null };
    case "tenant-confirmation-started":
      return transition(state, "confirming-tenant", { manualTenantId: event.tenantId, tenantIdError: null });
    case "tenant-confirmed":
      return transition(state, "tenant-confirmed", {
        account: event.account,
        manualTenantId: event.tenantId,
        confirmedTenantId: event.tenantId,
        tenantIdError: null,
      });
    case "tenant-confirmation-failed":
      return transition(state, "error", { tenantIdError: event.error });
    case "tenant-consent-redirected":
      return transition(state, "selecting-tenant");
    case "logout-completed":
      return transition(state, "signed-out", {
        account: null,
        manualTenantId: "",
        confirmedTenantId: null,
        loginError: null,
        tenantIdError: null,
      });
  }
}

export type TenantQueryProjection = {
  tenants: AzureTenant[];
  tenantsLoading: boolean;
  tenantsRefreshing: boolean;
  tenantsError: string | null;
};

const emptyTenantQuery: TenantQueryProjection = {
  tenants: [],
  tenantsLoading: false,
  tenantsRefreshing: false,
  tenantsError: null,
};

export function getBaseCardContext(state: State, pinnedTenantId?: string, tenantQuery = emptyTenantQuery) {
  const done = state.lifecycle === "tenant-confirmed";
  const matchedTenant = tenantQuery.tenants.find((tenant) => tenant.tenantId.toLowerCase() === state.manualTenantId.toLowerCase())
    ?? tenantQuery.tenants.find((tenant) => tenant.displayName.toLowerCase() === state.manualTenantId.toLowerCase());
  const summary = ({
    loading: "Checking session...",
    unconfigured: "Unavailable",
    "signed-out": "Sign in to Azure",
    "signing-in": "Connecting...",
    "selecting-tenant": "Select a tenant",
    "confirming-tenant": "Confirming tenant...",
    "tenant-confirmed": [state.account?.username, tenantDisplayName(tenantQuery.tenants, state.confirmedTenantId)].filter(Boolean).join(" · ") || "Signed in",
    error: state.loginError ?? state.tenantIdError ?? "Error",
  } satisfies Record<Lifecycle, string>)[state.lifecycle];
  return {
    ...state.baseCardContext,
    summary,
    lifecycle: toBaseCardLifecycle(state.lifecycle),
    stateMachine: { graph: stateGraph, currentState: state.lifecycle },
    done,
    signedInUsername: state.account?.username ?? null,
    ...tenantQuery,
    tenantPinned: !!pinnedTenantId,
    manualTenantId: pinnedTenantId ?? matchedTenant?.tenantId ?? state.manualTenantId,
    loginError: state.loginError,
    tenantIdError: state.tenantIdError,
  } as const;
}

export const stateMachine: BaseCardStateMachine<Lifecycle, State, Event> = {
  graph: stateGraph,
  initialState,
  canTransition,
  reducer,
  toBaseCardLifecycle,
};
