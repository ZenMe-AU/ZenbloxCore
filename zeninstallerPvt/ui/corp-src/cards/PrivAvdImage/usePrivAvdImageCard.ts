/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { usePrivAvdDeploy, type PrivAvdDeploy, type PrivAvdTarget } from "../../hooks/util/usePrivAvdDeploy";
import type { CardHook, CardRequirements } from "../../types";
import { PRIVAVD_IMAGE_DIR, PRIVAVD_IMAGE_TITLE } from "./config";

export interface UsePrivAvdImageCard extends CardHook, PrivAvdDeploy {
  readonly cardId: "privavd_image";
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

export function usePrivAvdImageCard(target: PrivAvdTarget): UsePrivAvdImageCard {
  return {
    ...usePrivAvdDeploy({ dir: PRIVAVD_IMAGE_DIR, ...target }),
    cardId: "privavd_image" as const,
    cardRequirements: [
      "privavd_gallery"
    ],
    cardDependencyLabel: PRIVAVD_IMAGE_TITLE,
  };
}
