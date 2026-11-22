/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import {
  type Lifecycle,
} from "../../components/useBaseCard";

export type AuthPhase = "checking" | "signed-out" | "signing-in" | "signed-in" | "expired";

export type State = { phase: AuthPhase };

export type Event = { type: "phase-changed"; phase: AuthPhase };

export const initialState: State = { phase: "checking" };

const baseLifecycleByPhase: Record<AuthPhase, Lifecycle> = {
  checking: "loading",
  "signed-out": "ready",
  "signing-in": "action",
  "signed-in": "complete",
  expired: "error",
};

export function toBaseLifecycle(phase: AuthPhase): Lifecycle {
  return baseLifecycleByPhase[phase];
}

export function getGithubLoginPhase({
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
}): AuthPhase {
  return redirecting === "login" || verifying
    ? "signing-in"
    : loggingIn ? "checking" : account ? "signed-in" : sessionExpired ? "expired" : "signed-out";
}

export function reducer(state: State, event: Event): State {
  return event.phase === state.phase ? state : { phase: event.phase };
}