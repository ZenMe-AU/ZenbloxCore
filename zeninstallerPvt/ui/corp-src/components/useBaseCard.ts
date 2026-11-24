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
  const missing = baseCardContext.prerequisiteIds
    .map((id) => id.trim())
    .filter((id) => {
      if (!id) return false;
      const entry = appContext.cards[id as AppContextCardId];
      return id === baseCardContext.cardId || !entry?.initialised || entry.currentBaseCardStatus !== "complete";
    });
  return missing as AppContextCardId[];
}
