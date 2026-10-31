/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { usePrivAvdDeploy, type PrivAvdDeploy, type PrivAvdTarget } from "../../hooks/util/usePrivAvdDeploy";
import type { CardHook, CardRequirements } from "../../types";
import { PRIVAVD_GALLERY_DIR, PRIVAVD_GALLERY_TITLE } from "./config";

export interface UsePrivAvdGalleryCard extends CardHook, PrivAvdDeploy {
  readonly cardId: "privavd_gallery";
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

export function usePrivAvdGalleryCard(target: PrivAvdTarget): UsePrivAvdGalleryCard {
  return {
    ...usePrivAvdDeploy({ dir: PRIVAVD_GALLERY_DIR, ...target }),
    cardId: "privavd_gallery" as const,
    cardRequirements: [
      "repo", "core_infra"
    ],
    cardDependencyLabel: PRIVAVD_GALLERY_TITLE,
  };
}
