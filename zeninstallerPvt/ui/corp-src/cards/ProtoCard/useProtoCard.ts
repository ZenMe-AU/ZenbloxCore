/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useReducer, type Dispatch } from "react";
import type { CardHook } from "../../types";
import { getCardContext, initialState, protoReducer, requirements, type ProtoEvent } from "./stateMachine";

export interface UseProtoCard extends CardHook {
  readonly cardId: "proto_card";
  appContext: typeof initialState.appContext;
  cardContext: ReturnType<typeof getCardContext>;
  protoCardContext: typeof initialState.protoCardContext;
  dispatch: Dispatch<ProtoEvent>;
}

export function useProtoCard(): UseProtoCard {
  const [state, dispatch] = useReducer(protoReducer, initialState);
  const cardContext = getCardContext(state);
  const summary = cardContext.availability === "locked"
    ? `Locked: ${cardContext.unmetRequirements.map((id) => requirements[id]).join(", ")}`
    : cardContext.availability === "unavailable" ? "Configuration unavailable" : "Summary";

  return {
    cardId: "proto_card",
    status: cardContext.status,
    summary,
    done: cardContext.done,
    cardDependencyLabel: "Protocard",
    appContext: state.appContext,
    cardContext,
    protoCardContext: state.protoCardContext,
    dispatch,
  };
}
