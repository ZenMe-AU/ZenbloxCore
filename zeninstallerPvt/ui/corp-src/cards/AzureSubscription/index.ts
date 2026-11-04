/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AzureSubscriptionCard from "./AzureSubscriptionCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    azure_subscription: true;
  }
}

export default {
  id: "azure_subscription",
  title: "Choose Azure subscription",
  order: 50,
  cardRequirements: ["azure_login", "repo"],
  Component: AzureSubscriptionCard,
} satisfies CardModule;
