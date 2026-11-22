/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardId } from "../types";

export type Lifecycle = "blocked" | "loading" | "ready" | "action" | "commit" | "complete" | "error";

export type State<StateId extends string> = { lifecycle: StateId };
export type Event<StateId extends string> = { type: "transition"; lifecycle: StateId };

export type BaseCardState<StateId extends string = Lifecycle> = State<StateId>;
export type BaseCardEvent<StateId extends string = Lifecycle> = Event<StateId>;

export type BaseCardContext = BaseCardState & {
  cardId: CardId;
  title: string;
  prerequisiteIds: readonly string[];
  summary?: string;
};

export type StateGraphNode<StateId extends string, BaseLifecycle extends string> = {
  label: string;
  baseCardLifecycle: BaseLifecycle;
  transitions: readonly StateId[];
};

export type StateGraph<StateId extends string, BaseLifecycle extends string> =
  Record<StateId, StateGraphNode<StateId, BaseLifecycle>>;

export type BaseCardStateGraph<StateId extends string = Lifecycle> = StateGraph<StateId, Lifecycle>;

export interface BaseCardStateMachine<StateId extends string = Lifecycle> {
  graph: BaseCardStateGraph<StateId>;
  initialState: BaseCardState<StateId>;
  reducer: (state: BaseCardState<StateId>, event: BaseCardEvent<StateId>) => BaseCardState<StateId>;
  toBaseCardLifecycle: (stateId: StateId) => Lifecycle;
}