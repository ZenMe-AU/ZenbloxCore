/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardLifecycle } from "./components/basecardlifecycle";
import type { CardId, CardStatus, User } from "./types";

export type SharedCard = Readonly<{ title: string; status: CardStatus | CardLifecycle; githubAccount?: Readonly<User> | null }>;
type CardEntry = Readonly<{ initialised: false }> | (Readonly<{ initialised: true }> & SharedCard);
type SharedSnapshot = Readonly<{ cards: Readonly<Partial<Record<CardId, CardEntry>>> }>;
type CardEvent = Readonly<{ type: "added" | "initialised" | "updated"; cardId: CardId }>;

export function createSharedContext() {
  let snapshot: SharedSnapshot = { cards: {} };
  const listeners = new Set<(event: CardEvent) => void>();

  function publish(event: CardEvent, entry: CardEntry) {
    snapshot = { cards: { ...snapshot.cards, [event.cardId]: entry } };
    listeners.forEach((listener) => listener(event));
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: (event: CardEvent) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // Called after the card hook returns and React commits; initialised is not lifecycle ready.
    update: (cardId: CardId, shared: SharedCard) => {
      const current = snapshot.cards[cardId];
      const entry: CardEntry = {
        initialised: true,
        title: shared.title,
        status: shared.status,
        ...("githubAccount" in shared ? { githubAccount: shared.githubAccount ? { login: shared.githubAccount.login } : null } : {}),
      };
      if (!current) {
        publish({ type: "added", cardId }, { initialised: false });
        publish({ type: "initialised", cardId }, entry);
      } else if (!current.initialised) {
        publish({ type: "initialised", cardId }, entry);
      } else if (current.title !== shared.title || current.status !== shared.status
        || current.githubAccount?.login !== shared.githubAccount?.login || ("githubAccount" in current) !== ("githubAccount" in shared)) {
        publish({ type: "updated", cardId }, entry);
      }
    },
  };
}

export type SharedContext = ReturnType<typeof createSharedContext>;
