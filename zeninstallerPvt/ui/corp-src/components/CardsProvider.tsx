/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CardsContext } from "../hooks/useCards";
import { createResultStorage } from "../logic/resultStorage";
import type { CardChrome, CardHook, CardId } from "../types";

const EXPANDED_CARDS_KEY = "zeninstaller_corp_expanded_cards";
const { save: saveExpandedCards, load: loadExpandedCards } = createResultStorage<CardId[]>(EXPANDED_CARDS_KEY);

const sameFace = (a: CardHook | undefined, b: CardHook) =>
  !!a &&
  a.title === b.title &&
  a.done === b.done &&
  a.status === b.status &&
  a.summary === b.summary &&
  a.cardDependencyLabel === b.cardDependencyLabel &&
  a.hideFromProgress === b.hideFromProgress &&
  a.cardRequirements?.join() === b.cardRequirements?.join();

export default function CardsProvider({ children }: { children: ReactNode }) {
  // Keyed by id in first-report order; a report that changes nothing keeps the same object, so nothing re-renders.
  const [faces, setFaces] = useState<Record<string, CardHook>>({});
  const report = useCallback((face: CardHook) => setFaces((cur) => (sameFace(cur[face.cardId], face) ? cur : { ...cur, [face.cardId]: face })), []);

  // A Set, not a single id, so multiple cards can stay expanded at once. Persisted so
  // reloading or navigating back restores what was open.
  const [expandedIds, setExpandedIds] = useState<Set<CardId>>(() => new Set(loadExpandedCards() ?? []));
  useEffect(() => {
    saveExpandedCards(Array.from(expandedIds));
  }, [expandedIds]);
  const toggle = (id: CardId) =>
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Jumping to a prerequisite adds it to the expanded set rather than replacing it, so the card
  // you came from stays open too.
  const openCard = (id: CardId) => {
    setExpandedIds((cur) => new Set(cur).add(id));
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const cardProps = (id: CardId): CardChrome => {
    // A card hasn't reported during its very first render.
    const card: CardHook = faces[id] ?? { cardId: id, done: false, status: "idle" };
    const misconfigured = card.status === "unavailable";
    const requirementsForCard = (card.cardRequirements ?? [])
      .filter((reqCardId) => !faces[reqCardId]?.done)
      .map((reqCardId) => ({
        label: faces[reqCardId]?.cardDependencyLabel ?? "",
        target: reqCardId,
      }));
    const requirements = misconfigured ? [] : requirementsForCard;
    const locked = requirements.length > 0;
    return {
      cardId: id,
      // A locked card's hook computed its status assuming prerequisites were already met —
      // override to "idle" so it doesn't show e.g. a stale "warning" for work it can't do yet.
      status: locked ? "idle" : card.status,
      summary: card.summary,
      locked,
      requirements,
      unavailable: misconfigured,
      expanded: expandedIds.has(id),
      onToggle: () => toggle(id),
      onRequirementClick: openCard,
    };
  };

  return <CardsContext value={{ faces: Object.values(faces), cardProps, openCard, report }}>{children}</CardsContext>;
}
