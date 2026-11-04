/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createContext, useContext, useLayoutEffect, type ComponentType } from "react";
import type { CardChrome, CardHook, CardId } from "../types";

/*
 * What a card folder's index.ts exports. App finds every one (import.meta.glob) and renders them
 * by order, so adding or removing a folder adds or removes its card.
 */
export type CardModule = {
  order: number;
  Component: ComponentType;
};

/*
 * How cards reach each other without importing each other: every Card reports its face (status,
 * done, requirements, …), CardsProvider turns the faces into each card's chrome (locked, expanded, …).
 */
export type Cards = {
  faces: CardHook[]; // In the order the cards first reported, which is the order they're on the page.
  cardProps: (id: CardId) => CardChrome;
  openCard: (id: CardId) => void;
  report: (face: CardHook) => void;
};

export const CardsContext = createContext<Cards | null>(null);

export function useCards(): Cards {
  const cards = useContext(CardsContext);
  if (!cards) throw new Error("useCards needs CardsProvider");
  return cards;
}

// A layout effect, so the first report lands before the first paint and no dependent card flashes unlocked.
export function useReportCard(face: CardHook) {
  const { report } = useCards();
  useLayoutEffect(() => report(face));
}
