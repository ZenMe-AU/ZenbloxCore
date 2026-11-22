/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Lifecycle } from "./components/useBaseCard";
import type { CardId, CardStatus } from "./types";

export class SensitiveToken {
  readonly #value: string;

  constructor(value: string) { this.#value = value; }
  reveal(): string { return this.#value; }
  toJSON(): string { return "[REDACTED]"; }
  toString(): string { return "[REDACTED]"; }
}

export interface SharedCardDataById {
  readonly __registryMarker?: never;
}

type SharedData<Card extends CardId> = Card extends keyof SharedCardDataById
  ? SharedCardDataById[Card]
  : Record<never, never>;

export type SharedCard<Card extends CardId = CardId> = Card extends CardId ? Readonly<{
  title: string;
  status: CardStatus | Lifecycle;
} & SharedData<Card>> : never;

type CardEntry<Card extends CardId> = Readonly<{ initialised: false }> | (Readonly<{ initialised: true }> & SharedCard<Card>);
type CardEntryMap = { [Card in CardId]?: CardEntry<Card> };
type SharedSnapshot = Readonly<{ cards: Readonly<CardEntryMap> }>;
type CardEvent<Card extends CardId = CardId> = Readonly<{ type: "added" | "initialised" | "updated"; cardId: Card }>;

function sameSharedValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (left instanceof SensitiveToken || right instanceof SensitiveToken) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameSharedValue(value, right[index]));
  }
  const leftPrototype = Object.getPrototypeOf(left);
  const rightPrototype = Object.getPrototypeOf(right);
  if ((leftPrototype !== Object.prototype && leftPrototype !== null)
    || (rightPrototype !== Object.prototype && rightPrototype !== null)) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && sameSharedValue(leftRecord[key], rightRecord[key]));
}

export function createAppContext() {
  let snapshot: SharedSnapshot = { cards: {} };
  const listeners = new Set<(event: CardEvent) => void>();

  function publish<Card extends CardId>(event: CardEvent<Card>, entry: CardEntry<Card>) {
    snapshot = { cards: { ...snapshot.cards, [event.cardId]: entry } as CardEntryMap };
    listeners.forEach((listener) => listener(event));
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: (event: CardEvent) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // Called after the card hook returns and React commits; initialised is not lifecycle ready.
    update: <Card extends CardId>(cardId: Card, shared: SharedCard<Card>) => {
      const current = snapshot.cards[cardId];
      const entry: CardEntry<Card> = {
        initialised: true,
        ...shared,
      };
      if (!current) {
        publish({ type: "added", cardId }, { initialised: false });
        publish({ type: "initialised", cardId }, entry);
      } else if (!current.initialised) {
        publish({ type: "initialised", cardId }, entry);
      } else if (!sameSharedValue(current, entry)) {
        publish({ type: "updated", cardId }, entry);
      }
    },
  };
}

export type AppContext = ReturnType<typeof createAppContext>;
