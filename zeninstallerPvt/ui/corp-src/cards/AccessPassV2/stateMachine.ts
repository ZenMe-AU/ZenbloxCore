/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContextCardId } from "../../appContext";
import type { BaseCardContext, BaseCardState, BaseCardStateGraph, BaseCardStateMachine } from "../../components/basecardlifecycle";
import type { AccessPassResult } from "../../logic/accessPass";
import type { SetupStep } from "../../types";

declare module "../../appContext" {
  interface SharedCardDataById {
    access_pass_v2: Record<never, never>;
  }
}

export const cardId = "access_pass_v2";
export const PAGE_SIZE = 200;
export type StepId = "policy" | "removeMethods" | "rotatePassword" | "tap";
export type Lifecycle = "loading" | "blocked" | "ready" | "confirming" | StepId | "complete" | "error";
export type StoredResults = {
  identityKey: string;
  passes: Record<string, AccessPassResult>;
  deliveryConfirmed: Record<string, boolean>;
  completed: Record<string, boolean>;
};

type PrivateContext = {
  identityKey: string | null;
  selectedUserId: string;
  confirmationUserId: string | null;
  photoIdConfirmed: boolean;
  steps: SetupStep[];
  passes: Record<string, AccessPassResult>;
  deliveryConfirmed: Record<string, boolean>;
  completed: Record<string, boolean>;
  validationPending: boolean;
  currentPage: number;
  pageInput: string;
  error: string | null;
  consentRequired: boolean;
};

export type State = BaseCardState<Lifecycle> & {
  baseCardContext: Omit<BaseCardContext<Lifecycle>, "lifecycle"> & { unmetCardPrerequisites: AppContextCardId[] };
  privateContext: PrivateContext;
};

export const stateGraph = {
  loading: { label: "Loading users and checking saved passes", baseCardLifecycle: "loading", transitions: ["blocked", "ready", "complete", "error"] },
  blocked: { label: "Waiting for Azure login 2", baseCardLifecycle: "blocked", transitions: ["loading"] },
  ready: { label: "Select a user", baseCardLifecycle: "ready", transitions: ["confirming", "error", "loading", "blocked"] },
  confirming: { label: "Verify photo ID", baseCardLifecycle: "action", transitions: ["confirming", "policy", "ready", "complete", "loading", "blocked", "error"] },
  policy: { label: "Ensure TAP policy", baseCardLifecycle: "action", transitions: ["removeMethods", "error", "loading", "blocked"] },
  removeMethods: { label: "Remove existing login methods", baseCardLifecycle: "action", transitions: ["rotatePassword", "error", "loading", "blocked"] },
  rotatePassword: { label: "Randomize password", baseCardLifecycle: "action", transitions: ["tap", "error", "loading", "blocked"] },
  tap: { label: "Create temporary access pass", baseCardLifecycle: "commit", transitions: ["complete", "error", "loading", "blocked"] },
  complete: { label: "Access pass created", baseCardLifecycle: "complete", transitions: ["confirming", "ready", "loading", "blocked", "error"] },
  error: { label: "Failed", baseCardLifecycle: "error", transitions: ["confirming", "ready", "complete", "loading", "blocked"] },
} as const satisfies BaseCardStateGraph<Lifecycle>;

export function isRunning(lifecycle: Lifecycle): lifecycle is StepId {
  return lifecycle === "policy" || lifecycle === "removeMethods" || lifecycle === "rotatePassword" || lifecycle === "tap";
}

export const initialState: State = {
  lifecycle: "loading",
  baseCardContext: { cardId, title: "Access pass 2", prerequisiteIds: ["azure_login_v2"], unmetCardPrerequisites: ["azure_login_v2"] },
  privateContext: {
    identityKey: null, selectedUserId: "", confirmationUserId: null, photoIdConfirmed: false, steps: [],
    passes: {}, deliveryConfirmed: {}, completed: {}, validationPending: false,
    currentPage: 1, pageInput: "1", error: null, consentRequired: false,
  },
};

export function createInitialState(identityKey: string | null, saved: StoredResults | null): State {
  const restore = identityKey && saved?.identityKey === identityKey ? saved : null;
  return {
    ...initialState,
    lifecycle: identityKey ? "loading" : "blocked",
    privateContext: {
      ...initialState.privateContext, identityKey,
      passes: restore?.passes ?? {}, deliveryConfirmed: restore?.deliveryConfirmed ?? {}, completed: restore?.completed ?? {},
      validationPending: !!restore && Object.keys(restore.passes).length > 0,
    },
  };
}

export function toBaseCardLifecycle(lifecycle: Lifecycle) { return stateGraph[lifecycle].baseCardLifecycle; }

export function canTransition(state: State, next: Lifecycle): boolean {
  if (!stateGraph[state.lifecycle].transitions.some((target) => target === next)) return false;
  if (next === "loading" || next === "blocked") return true;
  if (!state.privateContext.identityKey || state.baseCardContext.unmetCardPrerequisites.length > 0) return false;
  return next !== "policy" || state.privateContext.photoIdConfirmed;
}

function transition(state: State, lifecycle: Lifecycle, changes: Partial<PrivateContext> = {}): State {
  if (!canTransition(state, lifecycle)) throw new Error(`Cannot transition from ${state.lifecycle} to ${lifecycle}`);
  return { ...state, lifecycle, privateContext: { ...state.privateContext, ...changes } };
}

const newSteps = (): SetupStep[] => [
  { id: "policy", label: "Ensure Temporary Access Pass Is Enabled", status: "pending" },
  { id: "removeMethods", label: "Remove Existing Login Methods", status: "pending" },
  { id: "rotatePassword", label: "Randomize User Password", status: "pending" },
  { id: "tap", label: "Create Temporary Access Pass", status: "pending" },
];

export type Event =
  | { type: "sync-prerequisites"; identityKey: string | null; unmet: AppContextCardId[]; saved: StoredResults | null }
  | { type: "checked"; error: string | null; consentRequired: boolean }
  | { type: "validated"; passes: Record<string, AccessPassResult> }
  | { type: "validation-failed"; error: string; consentRequired: boolean }
  | { type: "confirm-user"; userId: string }
  | { type: "photo-id"; confirmed: boolean }
  | { type: "start" }
  | { type: "step-finished"; stepId: Exclude<StepId, "tap">; status: "done" | "skipped"; detail: string }
  | { type: "pass-created"; result: AccessPassResult }
  | { type: "run-failed"; error: string; consentRequired: boolean }
  | { type: "reset" }
  | { type: "delivery-confirmed"; userId: string; confirmed: boolean }
  | { type: "mark-complete"; userId: string }
  | { type: "page"; page: number; totalPages: number }
  | { type: "page-input"; value: string }
  | { type: "ui-error"; error: string };

export function reducer(state: State, event: Event): State {
  const context = state.privateContext;
  switch (event.type) {
    case "sync-prerequisites": {
      const next = event.identityKey === context.identityKey ? state : createInitialState(event.identityKey, event.saved);
      return {
        ...next,
        lifecycle: event.identityKey && event.unmet.length === 0 ? "loading" : "blocked",
        baseCardContext: { ...next.baseCardContext, unmetCardPrerequisites: [...event.unmet] },
        privateContext: { ...next.privateContext, confirmationUserId: null, photoIdConfirmed: false },
      };
    }
    case "checked":
      if (state.lifecycle !== "loading") return state;
      return transition(state, event.error ? "error" : Object.keys(context.passes).length > 0 ? "complete" : "ready",
        { error: event.error, consentRequired: event.consentRequired });
    case "validated":
      return { ...state, privateContext: { ...context, passes: event.passes, validationPending: false } };
    case "validation-failed":
      return transition(state, "error", {
        passes: {}, deliveryConfirmed: {}, completed: {}, validationPending: false, error: event.error, consentRequired: event.consentRequired,
      });
    case "confirm-user":
      if (!event.userId) throw new Error("Select a managed user before creating an access pass");
      return transition(state, "confirming", {
        selectedUserId: event.userId, confirmationUserId: event.userId, photoIdConfirmed: false, steps: [], error: null, consentRequired: false,
      });
    case "photo-id":
      if (state.lifecycle !== "confirming") throw new Error("Photo ID can only be confirmed before starting the workflow");
      return { ...state, privateContext: { ...context, photoIdConfirmed: event.confirmed } };
    case "start": {
      if (context.confirmationUserId !== context.selectedUserId || !context.selectedUserId) throw new Error("Confirm the selected user's identity first");
      const passes = { ...context.passes };
      delete passes[context.selectedUserId];
      const steps = newSteps().map((step) => step.id === "policy" ? { ...step, status: "running" as const } : step);
      return transition(state, "policy", {
        confirmationUserId: null, photoIdConfirmed: false, steps, passes, error: null, consentRequired: false,
        deliveryConfirmed: { ...context.deliveryConfirmed, [context.selectedUserId]: false },
        completed: { ...context.completed, [context.selectedUserId]: false },
      });
    }
    case "step-finished": {
      if (state.lifecycle !== event.stepId) throw new Error(`Unexpected completion of step ${event.stepId}`);
      const next: StepId = event.stepId === "policy" ? "removeMethods" : event.stepId === "removeMethods" ? "rotatePassword" : "tap";
      const steps = context.steps.map((step) => step.id === event.stepId ? { ...step, status: event.status, detail: event.detail }
        : step.id === next ? { ...step, status: "running" as const } : step);
      return transition(state, next, { steps });
    }
    case "pass-created":
      if (event.result.targetUserId !== context.selectedUserId) throw new Error("The access pass does not match the selected user");
      return transition(state, "complete", {
        passes: { ...context.passes, [event.result.targetUserId]: event.result },
        error: null, consentRequired: false,
        steps: context.steps.map((step) => step.id === "tap" ? { ...step, status: "done", detail: "Temporary Access Pass created" } : step),
      });
    case "run-failed":
      return transition(state, "error", {
        error: event.error, consentRequired: event.consentRequired,
        steps: context.steps.map((step) => step.id === state.lifecycle ? { ...step, status: "error", detail: event.error } : step),
      });
    case "reset":
      return transition(state, Object.keys(context.passes).length > 0 ? "complete" : "ready",
        { error: null, consentRequired: false, steps: [], confirmationUserId: null, photoIdConfirmed: false });
    case "delivery-confirmed":
      if (isRunning(state.lifecycle) || !context.passes[event.userId]) throw new Error("A created pass is required before confirming delivery");
      return { ...state, privateContext: {
        ...context, deliveryConfirmed: { ...context.deliveryConfirmed, [event.userId]: event.confirmed },
        completed: { ...context.completed, [event.userId]: event.confirmed && !!context.completed[event.userId] },
      } };
    case "mark-complete":
      if (isRunning(state.lifecycle) || !context.passes[event.userId] || !context.deliveryConfirmed[event.userId]) {
        throw new Error("Confirm that the user has set up their own sign-in method before marking complete");
      }
      return { ...state, privateContext: { ...context, completed: { ...context.completed, [event.userId]: true } } };
    case "page": {
      if (!Number.isInteger(event.page) || !Number.isInteger(event.totalPages) || event.totalPages < 1) throw new Error("Enter a valid page number");
      const currentPage = Math.max(1, Math.min(event.page, event.totalPages));
      return { ...state, privateContext: { ...context, currentPage, pageInput: String(currentPage) } };
    }
    case "page-input":
      return { ...state, privateContext: { ...context, pageInput: event.value.replace(/[^0-9]/g, "") } };
    case "ui-error":
      return { ...state, privateContext: { ...context, error: event.error } };
  }
}

export function getBaseCardContext(state: State) {
  const lifecycle = toBaseCardLifecycle(state.lifecycle);
  const summary = state.lifecycle === "blocked" ? "Sign in with Azure login 2"
    : state.lifecycle === "loading" ? "Loading users and checking saved access passes..."
    : state.lifecycle === "error" ? state.privateContext.error ?? "Access pass creation failed"
    : state.lifecycle === "confirming" ? "Verify the selected user's photo ID"
    : isRunning(state.lifecycle) ? stateGraph[state.lifecycle].label
    : state.lifecycle === "complete" ? "Access pass created" : "Select a user and create an access pass";
  return {
    ...state.baseCardContext, lifecycle, summary,
    done: lifecycle === "complete" && state.baseCardContext.unmetCardPrerequisites.length === 0,
    stateMachine: { graph: stateGraph, currentState: state.lifecycle },
  };
}

export const stateMachine: BaseCardStateMachine<Lifecycle, State, Event> = {
  graph: stateGraph, initialState, canTransition, reducer, toBaseCardLifecycle,
};
