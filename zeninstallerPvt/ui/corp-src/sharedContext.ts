/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardLifecycle } from "./components/cardLifecycle";
import type { CardId, CardStatus } from "./types";

export type SharedCard = Readonly<{ title: string; status: CardStatus | CardLifecycle }>;
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
      if (!current) {
        publish({ type: "added", cardId }, { initialised: false });
        publish({ type: "initialised", cardId }, { initialised: true, ...shared });
      } else if (!current.initialised) {
        publish({ type: "initialised", cardId }, { initialised: true, ...shared });
      } else if (current.title !== shared.title || current.status !== shared.status) {
        publish({ type: "updated", cardId }, { initialised: true, ...shared });
      }
    },
  };
}

export type SharedContext = ReturnType<typeof createSharedContext>;
