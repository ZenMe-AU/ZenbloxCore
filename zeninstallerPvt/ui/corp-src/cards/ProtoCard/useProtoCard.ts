/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardHook, CardStatus } from "../../types";



// ─── Types ────────────────────────────────────────────────────────────────────
export type GithubAuthRecord = { mode: "direct"; token: string } | { mode: "backend" };

export interface UseProtoCard extends CardHook {
  readonly cardId: "proto_card";
  status: CardStatus; // "loading" while the auth check is in-flight; "complete" once signed in; "idle" otherwise.
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Sign in to GitHub")
}

export function useProtoCard(): UseProtoCard {

  const status: CardStatus = "idle";
  const summary = "Summary";

  const cardDependencyLabel: string = "Sign in to GitHub";

  return {
    // cardHook
    cardId: "proto_card" as const,
    status,
    summary,
    cardDependencyLabel,
    done: false,
  };
}
