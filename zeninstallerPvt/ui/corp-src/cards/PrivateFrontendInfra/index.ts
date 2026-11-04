/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import PrivateFrontendInfraCard from "./PrivateFrontendInfraCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    private_frontend_infra: true;
  }
}

export default {
  id: "private_frontend_infra",
  title: "Frontend hosting environment",
  order: 110,
  cardRequirements: ["azure_login", "azure_subscription"],
  Component: PrivateFrontendInfraCard,
} satisfies CardModule;
