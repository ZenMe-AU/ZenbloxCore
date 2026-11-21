/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useReducer, useSyncExternalStore, type Dispatch } from "react";
import type { CardHook } from "../../types";
import type { SharedCard, AppContext } from "../../appContext";
import { getBaseCardContext, initialState, protoReducer, type ProtoEvent } from "./stateMachine";

let forceUnlockedForPage = false;

export interface UseProtoCard extends CardHook {
  shared: SharedCard;
  appContext: ReturnType<AppContext["getSnapshot"]>;
  baseCardContext: ReturnType<typeof getBaseCardContext>;
  protoCardContext: typeof initialState.protoCardContext;
  dispatch: Dispatch<ProtoEvent>;
}

export function useProtoCard(appStore: AppContext): UseProtoCard {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [state, dispatchState] = useReducer(protoReducer, initialState, (initial) => ({
    ...initial,
    protoCardContext: { ...initial.protoCardContext, forceUnlocked: forceUnlockedForPage },
  }));
  const unmet = state.protoCardContext.prerequisiteIds
    .map((id) => id.trim())
    .filter((id) => {
      if (!id) return false;
      const entry = Object.entries(appContext.cards).find(([cardId]) => cardId === id)?.[1];
      return id === state.baseCardContext.cardId || !entry?.initialised || entry.status !== "complete";
    });
  if (unmet.length !== state.protoCardContext.unmetCardPrerequisites.length
    || unmet.some((id, index) => id !== state.protoCardContext.unmetCardPrerequisites[index])) {
    dispatchState({ type: "sync-card-prerequisites", unmet });
  }
  const dispatch = useCallback((event: ProtoEvent) => {
    if (event.type === "force-unlock") forceUnlockedForPage = event.value;
    dispatchState(event);
  }, []);
  useEffect(() => {
    if (state.baseCardContext.lifecycle !== "loading") return;
    const timer = setTimeout(() => dispatchState({ type: "check-prerequisites" }), 2000);
    return () => clearTimeout(timer);
  }, [state.baseCardContext.lifecycle, state.protoCardContext.prerequisiteIds, state.protoCardContext.unmetCardPrerequisites]);
  const baseCardContext = getBaseCardContext(state);
  const status = baseCardContext.lifecycle === "loading"
    ? "loading"
    : baseCardContext.lifecycle === "blocked" ? "idle"
      : baseCardContext.lifecycle === "ready" || baseCardContext.lifecycle === "action" || baseCardContext.lifecycle === "commit"
        ? "warning" : baseCardContext.lifecycle;
  return {
    cardId: baseCardContext.cardId,
    shared: { title: baseCardContext.title, status: baseCardContext.lifecycle },
    status,
    summary: baseCardContext.summary,
    done: baseCardContext.done,
    cardDependencyLabel: "Protocard",
    appContext,
    baseCardContext,
    protoCardContext: state.protoCardContext,
    dispatch,
  };
}
