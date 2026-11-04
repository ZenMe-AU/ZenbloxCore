/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import GlobalGroupsCard from "./GlobalGroupsCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    global_groups: true;
  }
}

export default {
  id: "global_groups",
  title: "Global groups",
  order: 45,
  cardRequirements: ["azure_login"],
  Component: GlobalGroupsCard,
} satisfies CardModule;
