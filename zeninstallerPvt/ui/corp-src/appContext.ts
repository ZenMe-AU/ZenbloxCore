/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Lifecycle } from "./components/basecardlifecycle";

export class SensitiveToken {
  readonly #value: string;

  constructor(value: string) { this.#value = value; }
  reveal(): string { return this.#value; }
  toJSON(): string { return "[REDACTED]"; }
  toString(): string { return "[REDACTED]"; }
}

declare const sharedCardDataRegistryMarker: unique symbol;

export interface SharedCardDataById {
  readonly [sharedCardDataRegistryMarker]?: never;
}

export type AppContextCardId = Extract<keyof SharedCardDataById, string>;

type SharedData<Card extends AppContextCardId> = SharedCardDataById[Card];

export type SharedCard<Card extends AppContextCardId> = Readonly<{
  title: string;
  currentBaseCardStatus: Lifecycle;
  currentStatus: string;
} & SharedData<Card>>;

type CardEntry<Card extends AppContextCardId> = Readonly<{ initialised: false }> | (Readonly<{ initialised: true }> & SharedCard<Card>);
type CardEntryMap = { [Card in AppContextCardId]?: CardEntry<Card> };
type SharedSnapshot = Readonly<{
  cards: Readonly<CardEntryMap>;
  urlParams: Readonly<Record<string, string>>;
}>;
type CardEvent<Card extends AppContextCardId = AppContextCardId> = Readonly<{ type: "added" | "initialised" | "updated"; cardId: Card }>;
type AppContextEvent = CardEvent | Readonly<{ type: "url-updated"; keys: readonly string[] }>;
export type UrlParamUpdates = Readonly<Record<string, string | null | undefined>>;

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

export function createAppContext(urlParams: Readonly<Record<string, string>> = {}) {
  let snapshot: SharedSnapshot = {
    cards: {},
    urlParams: Object.freeze({ ...urlParams }),
  };
  const listeners = new Set<(event: AppContextEvent) => void>();

  function publish<Card extends AppContextCardId>(event: CardEvent<Card>, entry: CardEntry<Card>) {
    snapshot = { ...snapshot, cards: { ...snapshot.cards, [event.cardId]: entry } as CardEntryMap };
    listeners.forEach((listener) => listener(event));
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: (event: AppContextEvent) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    updateUrl: (updates: UrlParamUpdates) => {
      const params = new URLSearchParams(snapshot.urlParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }

      const nextUrlParams = Object.fromEntries(params.entries());
      const changed = !sameSharedValue(snapshot.urlParams, nextUrlParams);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.search = params.toString();
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      if (!changed) return;

      snapshot = { ...snapshot, urlParams: Object.freeze(nextUrlParams) };
      listeners.forEach((listener) => listener({ type: "url-updated", keys: Object.keys(updates) }));
    },
    // Called after the card hook returns and React commits; initialised is not lifecycle ready.
    update: <Card extends AppContextCardId>(cardId: Card, shared: SharedCard<Card>) => {
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
