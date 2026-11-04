/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import CoreInfraCard from "./CoreInfraCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    core_infra: true;
  }
}

export default {
  id: "core_infra",
  title: "Terraform state backend",
  order: 70,
  cardRequirements: ["azure_login", "repo", "azure_subscription", "azure_app_registration"],
  Component: CoreInfraCard,
} satisfies CardModule;
