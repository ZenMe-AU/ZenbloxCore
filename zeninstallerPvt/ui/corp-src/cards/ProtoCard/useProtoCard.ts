/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useReducer, type Dispatch } from "react";
import type { CardHook } from "../../types";
import { getBaseCardContext, initialState, protoReducer, requirements, type ProtoEvent } from "./stateMachine";

let forceUnlockedForPage = false;

export interface UseProtoCard extends CardHook {
  readonly cardId: "proto_card";
  appContext: typeof initialState.appContext;
  baseCardContext: ReturnType<typeof getBaseCardContext>;
  protoCardContext: typeof initialState.protoCardContext;
  dispatch: Dispatch<ProtoEvent>;
}

export function useProtoCard(): UseProtoCard {
  const [state, dispatchState] = useReducer(protoReducer, initialState, (initial) => ({
    ...initial,
    protoCardContext: { ...initial.protoCardContext, forceUnlocked: forceUnlockedForPage },
  }));
  const dispatch = useCallback((event: ProtoEvent) => {
    if (event.type === "force-unlock") forceUnlockedForPage = event.value;
    dispatchState(event);
  }, []);
  useEffect(() => {
    if (state.baseCardContext.lifecycle !== "loading") return;
    const timer = setTimeout(() => dispatchState({ type: "check-prerequisites" }), 2000);
    return () => clearTimeout(timer);
  }, [state.baseCardContext.lifecycle, state.appContext]);
  const baseCardContext = getBaseCardContext(state);
  const status = baseCardContext.lifecycle === "loading"
    ? "loading"
    : !state.appContext.configured
      ? "unavailable"
      : baseCardContext.lifecycle === "blocked" ? "idle"
        : baseCardContext.lifecycle === "ready" ? "warning" : baseCardContext.lifecycle;
  const summary = baseCardContext.lifecycle === "loading"
    ? "Checking prerequisites..."
    : !state.appContext.configured
      ? "Configuration unavailable"
      : baseCardContext.lifecycle === "blocked"
        ? `Blocked: ${baseCardContext.unmetRequirements.map((id) => requirements[id]).join(", ")}`
        : "Summary";

  return {
    cardId: "proto_card",
    status,
    summary,
    done: baseCardContext.done,
    cardDependencyLabel: "Protocard",
    appContext: state.appContext,
    baseCardContext,
    protoCardContext: state.protoCardContext,
    dispatch,
  };
}
