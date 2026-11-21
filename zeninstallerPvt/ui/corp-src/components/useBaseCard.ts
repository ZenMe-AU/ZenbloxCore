/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext } from "../appContext";
import type { CardId } from "../types";

export type CardLifecycle = "blocked" | "loading" | "ready" | "action" | "commit" | "complete" | "error";
export type CardLifecycleContext = { lifecycle: CardLifecycle };
export type CardLifecycleEvent = { type: "transition"; lifecycle: CardLifecycle };

export type BaseCardContext = CardLifecycleContext & {
  cardId: CardId;
  title: string;
  prerequisiteIds: readonly string[];
  summary?: string;
};

export const initialCardLifecycle: CardLifecycleContext = { lifecycle: "loading" };

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

const transitions: Record<CardLifecycle, readonly CardLifecycle[]> = {
  blocked: ["loading"],
  loading: ["ready", "action", "commit", "blocked"],
  ready: ["action", "error"],
  action: ["commit", "error"],
  commit: ["complete", "error"],
  complete: ["loading"],
  error: ["loading"],
};

export function canCardTransition(context: CardLifecycleContext, lifecycle: CardLifecycle): boolean {
  return transitions[context.lifecycle].includes(lifecycle);
}

export function cardLifecycleReducer<T extends CardLifecycleContext>(
  context: T,
  event: CardLifecycleEvent,
): Omit<T, "lifecycle"> & CardLifecycleContext {
  if (!canCardTransition(context, event.lifecycle)) {
    throw new Error(`Cannot transition from ${context.lifecycle} to ${event.lifecycle}`);
  }
  return { ...context, lifecycle: event.lifecycle };
}