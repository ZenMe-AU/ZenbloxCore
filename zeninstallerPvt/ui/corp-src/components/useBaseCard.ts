/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useSyncExternalStore } from "react";
import type { AppContext, AppContextCardId, SharedCard } from "../appContext";

export type { BaseCardContext, Lifecycle } from "./basecardlifecycle";

// All a prerequisite check reads from a card's BaseCardContext.
type PrerequisiteContext<Id extends AppContextCardId = AppContextCardId> = {
  cardId: AppContextCardId;
  prerequisiteIds: readonly (Id | "")[];
};

// A card's AppContext snapshot, what each prerequisite shares (by card id) once they are all complete, and the cards that block it.
export function useCardAppContext<Id extends AppContextCardId>(appStore: AppContext, prerequisiteContext: PrerequisiteContext<Id>) {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const missing = checkPrerequisites(appContext, prerequisiteContext);
  const prerequisiteIds = prerequisiteContext.prerequisiteIds.filter((id): id is Id => !!id.trim());
  const unmet = missing.length > 0 ? missing : prerequisiteIds.filter((id) => Object.values(appContext.cards[id]).includes(null));
  const prerequisites = unmet.length > 0 ? null : Object.fromEntries(
    prerequisiteIds.map((id) => [id, appContext.cards[id]]),
  ) as unknown as { [Card in Id]: SharedCard<Card> };
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
