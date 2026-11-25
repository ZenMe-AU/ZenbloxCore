/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { GA_CLOUDFRONT_STAGE } from "../GaCloudFront/config";
import { GA_SUBSCRIPTION_BUDGET_STAGE } from "../GaSubscriptionBudget/config";
import type { StageDefinition } from "../../types";

export const GA_STAGE_DEFINITIONS = [GA_SUBSCRIPTION_BUDGET_STAGE, GA_CLOUDFRONT_STAGE] as const;

export type GaStageDefinition = StageDefinition & (typeof GA_STAGE_DEFINITIONS)[number];
// Workflow reports and dispatches use the directory; card IDs are UI-only identities.
export type GaStageKey = GaStageDefinition["dir"];
