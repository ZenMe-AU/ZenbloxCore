/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext } from "../appContext";
import type { CardId } from "../types";

export type Lifecycle = "blocked" | "loading" | "ready" | "action" | "commit" | "complete" | "error";
export type LifecycleContext = { lifecycle: Lifecycle };
export type LifecycleEvent = { type: "transition"; lifecycle: Lifecycle };
export type LifecycleState = { context: LifecycleContext; targetPhase?: Lifecycle | null };

export type BaseCardContext = LifecycleContext & {
  cardId: CardId;
  title: string;
  prerequisiteIds: readonly string[];
  summary?: string;
};

export const initialLifecycle: LifecycleContext = { lifecycle: "loading" };

export function checkPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: BaseCardContext,
): string[] {
  return baseCardContext.prerequisiteIds
    .map((id) => id.trim())
    .filter((id) => {
      if (!id) return false;
      const entry = Object.entries(appContext.cards).find(([key]) => key === id)?.[1];
      return id === baseCardContext.cardId || !entry?.initialised || entry.status !== "complete";
    });
}

const transitions: Record<Lifecycle, readonly Lifecycle[]> = {
  blocked: ["loading"],
  loading: ["ready", "action", "commit", "blocked"],
  ready: ["action", "error"],
  action: ["commit", "error"],
  commit: ["complete", "error"],
  complete: ["loading"],
  error: ["loading"],
};

export function canTransition(context: LifecycleContext, lifecycle: Lifecycle): boolean {
  return transitions[context.lifecycle].includes(lifecycle);
}

export function lifecycleReducer<T extends LifecycleContext>(
  context: T,
  event: LifecycleEvent,
): Omit<T, "lifecycle"> & LifecycleContext {
  if (!canTransition(context, event.lifecycle)) {
    throw new Error(`Cannot transition from ${context.lifecycle} to ${event.lifecycle}`);
  }
  return { ...context, lifecycle: event.lifecycle };
}