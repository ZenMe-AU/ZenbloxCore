/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useReducer, type Dispatch } from "react";
import type { AppContext } from "../../appContext";
import { useCardAppContext } from "../../components/useBaseCard";
import { getBaseCardContext, initialState, reducer, type Event } from "./stateMachine";

export interface UseProtoCard {
  baseCardContext: ReturnType<typeof getBaseCardContext>;
  privateContext: typeof initialState.privateContext & {
    appContext: ReturnType<AppContext["getSnapshot"]>;
    dispatch: Dispatch<Event>;
  };
}

export function useProtoCard(appCtx: AppContext): UseProtoCard {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { appContext, unmet } = useCardAppContext(appCtx, getBaseCardContext(state));
  if (unmet.length !== state.baseCardContext.unmetCardPrerequisites.length
    || unmet.some((id, index) => id !== state.baseCardContext.unmetCardPrerequisites[index])) {
    dispatch({ type: "sync-card-prerequisites", unmet });
  }
  useEffect(() => {
    if (state.lifecycle !== "loading") return;
    const timer = setTimeout(() => dispatch({ type: "check-prerequisites" }), 2000);
    return () => clearTimeout(timer);
  }, [state.lifecycle, state.baseCardContext.prerequisiteIds, state.baseCardContext.unmetCardPrerequisites]);
  const baseCardContext = getBaseCardContext(state);
  useEffect(() => {
    appCtx.update("proto_card", {
      title: baseCardContext.title,
      currentBaseCardStatus: baseCardContext.lifecycle,
      currentStatus: state.lifecycle,
    });
  }, [appCtx, baseCardContext.title, baseCardContext.lifecycle, state.lifecycle]);
  return {
    baseCardContext,
    privateContext: { ...state.privateContext, appContext, dispatch },
  };
}
