/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContextCardId } from "../../appContext";
import type {
  Lifecycle as BaseCardLifecycle,
  BaseCardContext,
  BaseCardStateGraph,
} from "../../components/basecardlifecycle";
import type { SetupStep } from "../../types";

export const cardId = "azure_app_registration_v2" as const;

declare module "../../appContext" {
  interface SharedCardDataById {
    [cardId]: {
      azureClientId: string | null;
    };
  }
}

export const azureLoginCardId = "azure_login_v2" satisfies BaseCardContext["cardId"];
export const repoCardId = "repo_v2" satisfies BaseCardContext["cardId"];
export const subscriptionCardId = "azure_subscription_v2" satisfies BaseCardContext["cardId"];
export const githubLoginCardId = "github_login_v2" satisfies BaseCardContext["cardId"];

export const initialCardContext = {
  cardId,
  title: "GitHub App Registration 2",
  prerequisiteIds: [azureLoginCardId, repoCardId, subscriptionCardId],
} satisfies Omit<BaseCardContext, "lifecycle">;

export type Lifecycle = "blocked" | "loading" | "ready" | "running" | "unsaved" | "complete" | "error";

export const stateGraph = {
  blocked: {
    label: "Waiting for Azure login 2, Repository & environment 2 and Azure subscription 2",
    baseCardLifecycle: "blocked",
    transitions: ["loading", "ready", "complete", "error"],
  },
  // Checking Azure access, the app's service principal and its role, or loading the GitHub variables.
  loading: {
    label: "Checking app registration",
    baseCardLifecycle: "loading",
    transitions: ["blocked", "ready", "unsaved", "complete", "error"],
  },
  // Nothing saved yet, or what's saved no longer works here: not in this tenant, missing its role, or drifted.
  ready: {
    label: "Create app registration",
    baseCardLifecycle: "ready",
    transitions: ["blocked", "loading", "running", "complete", "error"],
  },
  // Cancelling goes back to ready; a finished run is unsaved until GitHub holds its client id.
  running: {
    label: "Creating app registration",
    baseCardLifecycle: "action",
    transitions: ["blocked", "loading", "ready", "unsaved", "error"],
  },
  // The run made the app, but GitHub doesn't hold its client id yet.
  unsaved: {
    label: "Unsaved change",
    baseCardLifecycle: "commit",
    transitions: ["blocked", "loading", "ready", "complete", "error"],
  },
  // Re-running is allowed; a GitHub edit can make it unsaved again or leave nothing that works (ready).
  complete: {
    label: "App registration ready",
    baseCardLifecycle: "complete",
    transitions: ["blocked", "loading", "ready", "running", "unsaved", "error"],
  },
  // A step failed, or Azure access or the app's role couldn't be checked.
  error: {
    label: "Error",
    baseCardLifecycle: "error",
    transitions: ["blocked", "loading", "ready", "running", "complete"],
  },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export type State = {
  scopeKey: string | null;
  activeRunId: number | null;
  steps: SetupStep[];
  result: { scopeKey: string; clientId: string } | null;
  autoSaveCounter: number;
};

type ScopedRunEvent = { scopeKey: string; runId: number };

export type Event =
  | { type: "scope-changed"; scopeKey: string | null }
  | ({ type: "run-started"; steps: SetupStep[] } & ScopedRunEvent)
  | ({ type: "step-updated"; stepId: string; status: SetupStep["status"]; detail?: string; progress?: number } & ScopedRunEvent)
  | ({ type: "run-completed"; clientId: string } & ScopedRunEvent)
  | ({ type: "run-failed" } & ScopedRunEvent) // The failed step holds the message.
  | ({ type: "run-cancelled" } & ScopedRunEvent)
  | { type: "reset" };

export const initialState: State = {
  scopeKey: null,
  activeRunId: null,
  steps: [],
  result: null,
  autoSaveCounter: 0,
};

export function toBaseCardLifecycle(state: Lifecycle): BaseCardLifecycle {
  return stateGraph[state].baseCardLifecycle;
}

export function deriveLifecycle({
  prerequisitesMet,
  running,
  checking,
  failed,
  unsaved,
  verified,
}: {
  prerequisitesMet: boolean;
  running: boolean;
  checking: boolean;
  failed: boolean;
  unsaved: boolean; // A run made the app, but GitHub doesn't hold its client id.
  verified: boolean; // GitHub holds the client id, and the app has its role on the subscription.
}): Lifecycle {
  if (!prerequisitesMet) return "blocked";
  if (running) return "running";
  if (checking) return "loading";
  if (failed) return "error";
  if (unsaved) return "unsaved";
  return verified ? "complete" : "ready";
}

export function getBaseCardContext(state: State, status: {
  unmetCardPrerequisites: readonly AppContextCardId[];
  blockedSummary: string;
  prerequisitesMet: boolean;
  checkingMessage: string | null;
  managementAccessStatus: string;
  discoveryError: string | null;
  rbacStatus: string;
  rbacError: string | null;
  differsFromGithub: boolean;
  verified: boolean;
  planClientIdMismatch: boolean;
  hasSavedClientId: boolean;
}): BaseCardContext<Lifecycle> {
  const failedStep = state.steps.find((step) => step.status === "error");
  const lifecycle = deriveLifecycle({
    prerequisitesMet: status.prerequisitesMet,
    running: state.activeRunId !== null,
    checking: !!status.checkingMessage,
    failed: !!failedStep || status.managementAccessStatus === "error" || !!status.rbacError || !!status.discoveryError,
    unsaved: status.differsFromGithub,
    verified: status.verified,
  });
  const summary = ({
    blocked: status.blockedSummary,
    loading: status.checkingMessage ?? "Checking app registration",
    running: state.steps.find((step) => step.status === "running")?.label ?? "Creating app registration",
    error: failedStep ? `Failed: ${failedStep.label}`
      : status.managementAccessStatus === "error" ? "Insufficient permissions to continue"
      : status.discoveryError ?? "Could not verify app registration access",
    unsaved: "Save app registration connection details",
    ready: status.rbacStatus === "sp-not-found" ? "Not found in the selected tenant — recreate it"
      : status.rbacStatus === "missing-role" ? "Missing access on the selected subscription"
      : status.planClientIdMismatch ? "AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID"
      : status.managementAccessStatus === "warning" ? "Missing Azure permissions to continue"
      : status.hasSavedClientId ? "Re-run app registration" : "Create app registration",
    complete: "App registration ready",
  } satisfies Record<Lifecycle, string>)[lifecycle];
  return {
    ...initialCardContext,
    unmetCardPrerequisites: status.unmetCardPrerequisites,
    summary,
    lifecycle: toBaseCardLifecycle(lifecycle),
    stateMachine: { graph: stateGraph, currentState: lifecycle },
  };
}

// Also the guard for the run command: the button and the hook's run both ask it for → "running".
export function canLifecycleTransition(from: Lifecycle, to: Lifecycle): boolean {
  return stateGraph[from].transitions.some((lifecycle) => lifecycle === to);
}

export function reducer(state: State, event: Event): State {
  if (event.type === "scope-changed") {
    if (event.scopeKey === state.scopeKey) return state;
    return {
      scopeKey: event.scopeKey,
      activeRunId: null,
      steps: [],
      result: null,
      autoSaveCounter: state.autoSaveCounter,
    };
  }
  if (event.type === "run-started") {
    if (event.scopeKey !== state.scopeKey) return state;
    return { ...state, activeRunId: event.runId, steps: event.steps, result: null };
  }
  if (event.type === "reset") {
    return { ...state, activeRunId: null, steps: [], result: null };
  }
  if (event.scopeKey !== state.scopeKey || event.runId !== state.activeRunId) return state;

  if (event.type === "step-updated") {
    return {
      ...state,
      steps: state.steps.map((step) => step.id === event.stepId
        ? { ...step, status: event.status, detail: event.detail, progress: event.progress }
        : step),
    };
  }
  if (event.type === "run-completed") {
    return {
      ...state,
      activeRunId: null,
      result: { scopeKey: event.scopeKey, clientId: event.clientId },
      autoSaveCounter: state.autoSaveCounter + 1,
    };
  }
  // run-failed and run-cancelled: the run is over; a failed step keeps its message.
  return { ...state, activeRunId: null };
}
