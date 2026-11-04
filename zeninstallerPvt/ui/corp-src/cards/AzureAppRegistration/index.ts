/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AzureAppRegistrationCard from "./AzureAppRegistrationCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    azure_app_registration: true;
  }
}

export default {
  id: "azure_app_registration",
  title: "Create an app registration in Azure",
  order: 60,
  cardRequirements: ["github_login", "azure_login", "repo", "azure_subscription"],
  Component: AzureAppRegistrationCard,
} satisfies CardModule;
