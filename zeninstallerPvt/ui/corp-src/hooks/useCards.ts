/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createContext, useContext, useLayoutEffect, type ComponentType } from "react";
import type { CardChrome, CardFace, CardId, CardRequirements } from "../types";

/*
 * What a card folder's index.ts exports. App finds every one (import.meta.glob) and renders them
 * by order, so adding or removing a folder adds or removes its card.
 */
export type CardModule = {
  id: CardId; // The card's id, which config/cardOrder.ts lists; a module that renders several cards (Stage) names the group.
  title: string;
  order: number; // Where the card goes when cardOrder.ts doesn't list it.
  cardRequirements?: CardRequirements; // The cards that must be done first; the card stays locked until they are.
  Component: ComponentType;
};

/*
 * How cards reach each other without importing each other: every Card reports its face (status,
 * done, requirements, …), CardsProvider turns the faces into each card's chrome (locked, expanded, …).
 */
export type Cards = {
  faces: CardFace[]; // In the order the cards first reported, which is the order they're on the page.
  cardProps: (id: CardId) => CardChrome;
  openCard: (id: CardId) => void;
  report: (face: CardFace) => void;
};

export const CardsContext = createContext<Cards | null>(null);

// The module App is rendering, so its Card gets the id and title from index.ts instead of the card repeating them.
export const CardModuleContext = createContext<Pick<CardModule, "id" | "title" | "cardRequirements"> | null>(null);

export function useCards(): Cards {
  const cards = useContext(CardsContext);
  if (!cards) throw new Error("useCards needs CardsProvider");
  return cards;
}

// A layout effect, so the first report lands before the first paint and no dependent card flashes unlocked.
export function useReportCard(face: CardFace) {
  const { report } = useCards();
  useLayoutEffect(() => report(face));
}
