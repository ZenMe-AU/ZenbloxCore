/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useReducer, useSyncExternalStore, type Dispatch } from "react";
import type { CardHook } from "../../types";
import type { SharedCard, AppContext } from "../../appContext";
import { checkPrerequisites } from "../../components/useBaseCard";
import { getBaseCardContext, initialState, reducer, type Event } from "./stateMachine";

let forceUnlockedForPage = false;

export interface UseProtoCard extends CardHook {
  shared: SharedCard;
  appContext: ReturnType<AppContext["getSnapshot"]>;
  baseCardContext: ReturnType<typeof getBaseCardContext>;
  privateContext: typeof initialState.privateContext;
  dispatch: Dispatch<Event>;
}

export function useProtoCard(appStore: AppContext): UseProtoCard {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [state, dispatchState] = useReducer(reducer, initialState, (initial) => ({
    ...initial,
    privateContext: { ...initial.privateContext, forceUnlocked: forceUnlockedForPage },
  }));
  const unmet = checkPrerequisites(appContext, getBaseCardContext(state));
  if (unmet.length !== state.privateContext.unmetCardPrerequisites.length
    || unmet.some((id, index) => id !== state.privateContext.unmetCardPrerequisites[index])) {
    dispatchState({ type: "sync-card-prerequisites", unmet });
  }
  const dispatch = useCallback((event: Event) => {
    if (event.type === "force-unlock") forceUnlockedForPage = event.value;
    dispatchState(event);
  }, []);
  useEffect(() => {
    if (state.lifecycle !== "loading") return;
    const timer = setTimeout(() => dispatchState({ type: "check-prerequisites" }), 2000);
    return () => clearTimeout(timer);
  }, [state.lifecycle, state.baseCardContext.prerequisiteIds, state.privateContext.unmetCardPrerequisites]);
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
    privateContext: state.privateContext,
    dispatch,
  };
}
