/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext, AppContextCardId } from "../appContext";
import type { BaseCardContext } from "./basecardlifecycle";

export type { BaseCardContext, Lifecycle } from "./basecardlifecycle";

export function checkPrerequisites(
  appContext: ReturnType<AppContext["getSnapshot"]>,
  baseCardContext: BaseCardContext<string>,
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
