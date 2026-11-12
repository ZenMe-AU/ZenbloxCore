/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { usePrivAvdDeploy, type PrivAvdDeploy, type PrivAvdTarget } from "../../hooks/util/usePrivAvdDeploy";
import type { CardHook, CardRequirements } from "../../types";
import { PRIVAVD_PAW_DIR, PRIVAVD_PAW_TITLE } from "./config";

export interface UsePrivAvdPawCard extends CardHook, PrivAvdDeploy {
  readonly cardId: "privavd_paw";
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

export function usePrivAvdPawCard(target: PrivAvdTarget): UsePrivAvdPawCard {
  return {
    ...usePrivAvdDeploy({ dir: PRIVAVD_PAW_DIR, ...target }),
    cardId: "privavd_paw" as const,
    cardRequirements: [
      "privavd_image"
    ],
    cardDependencyLabel: PRIVAVD_PAW_TITLE,
  };
}
