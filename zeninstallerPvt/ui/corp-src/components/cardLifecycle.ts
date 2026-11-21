/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export type CardLifecycle = "blocked" | "loading" | "complete" | "warning" | "error" | "skipped";
export type CardLifecycleContext = { lifecycle: CardLifecycle };
export type CardLifecycleEvent = { type: "transition"; lifecycle: CardLifecycle };

export const initialCardLifecycle: CardLifecycleContext = { lifecycle: "blocked" };

const transitions: Record<CardLifecycle, readonly CardLifecycle[]> = {
  blocked: ["loading", "skipped"],
  loading: ["complete", "warning", "error", "blocked"],
  complete: ["loading", "blocked"],
  warning: ["loading", "blocked", "skipped"],
  error: ["loading", "blocked"],
  skipped: ["blocked"],
};

export function canCardTransition(context: CardLifecycleContext, lifecycle: CardLifecycle): boolean {
  return transitions[context.lifecycle].includes(lifecycle);
}

export function cardLifecycleReducer(context: CardLifecycleContext, event: CardLifecycleEvent): CardLifecycleContext {
  if (!canCardTransition(context, event.lifecycle)) {
    throw new Error(`Cannot transition from ${context.lifecycle} to ${event.lifecycle}`);
  }
  return { ...context, lifecycle: event.lifecycle };
}
