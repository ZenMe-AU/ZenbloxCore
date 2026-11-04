/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/*
 * The page order, by the id in each card folder's index.ts. Cards listed here come first, in this
 * order; the rest follow by their own `order`. An id with no card is ignored (`pnpm run dev` warns in the terminal), so removing or
 * parking a card folder never breaks this list. The stage cards move together as "stages".
 */
export const CARD_ORDER: readonly string[] = ["github_signup"];
