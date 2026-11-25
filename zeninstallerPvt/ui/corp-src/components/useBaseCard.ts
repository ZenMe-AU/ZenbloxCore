/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useSyncExternalStore } from "react";
import type { AppContext, AppContextCardId } from "../appContext";
import type { BaseCardContext } from "./basecardlifecycle";

export type { BaseCardContext, Lifecycle } from "./basecardlifecycle";

type AppSnapshot = ReturnType<AppContext["getSnapshot"]>;
// All a prerequisite check reads from a card's BaseCardContext.
type PrerequisiteContext = Pick<BaseCardContext<string>, "cardId" | "prerequisiteIds">;

// A card's AppContext snapshot, what its prerequisites share once they are all complete, and the cards that block it.
export function useCardAppContext<Shared = Record<never, never>>(
  appStore: AppContext,
  prerequisiteContext: PrerequisiteContext,
  getPrerequisites: (appContext: AppSnapshot) => Shared | null = () => ({}) as Shared,
) {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const missing = checkPrerequisites(appContext, prerequisiteContext);
  const prerequisites = missing.length > 0 ? null : getPrerequisites(appContext);
  const unmet = prerequisites || missing.length > 0
    ? missing
    : prerequisiteContext.prerequisiteIds.filter((id): id is AppContextCardId => !!id.trim()).slice(0, 1);
  const first = unmet[0] && appContext.cards[unmet[0]];
  const blockedSummary = first?.initialised ? `${first.title} (${unmet[0]})` : unmet[0] ?? "";
  return { appContext, prerequisites, unmet, blockedSummary };
}

export function checkPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: PrerequisiteContext,
): AppContextCardId[] {
  const missing: string[] = [];
  const visited = new Set<string>();
  const visit = (prerequisiteIds: readonly string[]) => {
    for (const rawId of prerequisiteIds) {
      const id = rawId.trim();
      if (!id || missing.includes(id)) continue;
      if (id === baseCardContext.cardId) {
        missing.push(id);
        continue;
      }
      if (visited.has(id)) continue;
      visited.add(id);
      const entry = appContext.cards[id as AppContextCardId];
      if (entry?.initialised) visit(entry.prerequisiteIds ?? []);
      if (!entry?.initialised || entry.currentBaseCardStatus !== "complete") missing.push(id);
    }
  };
  visit(baseCardContext.prerequisiteIds);
  return missing as AppContextCardId[];
}
