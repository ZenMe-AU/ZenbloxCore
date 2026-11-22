/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AppContext } from "../appContext";
import type { CardId } from "../types";

export type Lifecycle = "blocked" | "loading" | "ready" | "action" | "commit" | "complete" | "error";

export type BaseCardContext = {
  lifecycle: Lifecycle;
  cardId: CardId;
  title: string;
  prerequisiteIds: readonly string[];
  summary?: string;
};

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
