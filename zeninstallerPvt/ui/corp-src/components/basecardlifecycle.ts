/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardId } from "../types";

/** The set of states that are understood by BaseCard. */
export type Lifecycle = "blocked" | "loading" | "ready" | "action" | "commit" | "complete" | "error";

/** A single state from the lifecycle set for use in state machine transitions.. */
export type BaseCardState<lifecycle extends string = Lifecycle> = { lifecycle: lifecycle };

/** An event requesting a transition to one state from the set of lifecycle states. */
export type BaseCardEvent<lifecycle extends string = Lifecycle> = { type: "transition"; lifecycle: lifecycle };

/** The BaseCard context object that is passed to other components and hooks. */
export type BaseCardContext<lifecycle extends string = Lifecycle> = BaseCardState & {
  cardId: CardId;
  title: string;
  prerequisiteIds: readonly string[];
  summary?: string;
  stateMachine?: BaseCardStateMachineSnapshot<lifecycle>;
};

/** Describes a single state and the transitions allowed from it. */
export type StateGraphNode<lifecycle extends string, BaseLifecycle extends string> = {
  /** Human-readable name for visualizers and diagnostics. */
  label: string;
  /** BaseCard lifecycle displayed while the machine is in this state. */
  baseCardLifecycle: BaseLifecycle;
  /** State identifiers the machine may transition to from this state. */
  transitions: readonly lifecycle[];
};

/** Maps every valid state identifier to its graph node. */
export type StateGraph<lifecycle extends string, BaseLifecycle extends string> =
  Record<lifecycle, StateGraphNode<lifecycle, BaseLifecycle>>;

/** A state graph whose nodes map to BaseCard's display states. */
export type BaseCardStateGraph<lifecycle extends string = Lifecycle> = StateGraph<lifecycle, Lifecycle>;

/** Serializable state-machine data published with a BaseCard context. */
export type BaseCardStateMachineSnapshot<lifecycle extends string = Lifecycle> = {
  /** Current state identifier in the specialized machine. */
  currentState: lifecycle;
  /** State nodes and allowed transitions for the specialized machine. */
  graph: BaseCardStateGraph<lifecycle>;
};

/**
 * Contract for a card state machine composed with BaseCard.
 *
 * `lifecycle` is the union of valid state identifiers. 
 * `currentState` is the current-state object, which may contain additional consumer-specific data.
 * `Event` is the event shape accepted by the reducer.
 *
 * @template lifecycle Union of valid state identifiers for this machine.
 * @template currentState State object maintained for this state machine.
 * @template Event Event shape accepted by the reducer.
 */
export interface BaseCardStateMachine<
  lifecycle extends string = Lifecycle,
  currentState extends BaseCardState<lifecycle> = BaseCardState<lifecycle>,
  Event = BaseCardEvent<lifecycle>,
> {
  /** State graph and BaseCard display lifecycle mapping. */
  graph: BaseCardStateGraph<lifecycle>;
  /** Initial current state for this machine. */
  initialState: currentState;
  /** Whether `nextState` is allowed from `currentState`. */
  canTransition: (currentState: currentState, nextState: lifecycle) => boolean;
  /** Applies a machine event and returns the resulting current state. */
  reducer: (state: currentState, event: Event) => currentState;
  /** Maps one machine state identifier to the BaseCard display lifecycle. */
  toBaseCardLifecycle: (state: lifecycle) => Lifecycle;
}