/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AzureLoginCard from "./AzureLoginCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    azure_login: true;
  }
}

export default {
  id: "azure_login",
  title: "Azure login",
  order: 40,
  Component: AzureLoginCard,
} satisfies CardModule;
