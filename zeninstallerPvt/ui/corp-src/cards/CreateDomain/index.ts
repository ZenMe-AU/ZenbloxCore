/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import CreateDomainCard from "./CreateDomainCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    create_domain: true;
  }
}

export default {
  id: "create_domain",
  title: "Core domain",
  order: 80,
  cardRequirements: [
    "azure_login",
    "repo",
    "azure_subscription",
    "core_infra"
  ],
  Component: CreateDomainCard,
} satisfies CardModule;
