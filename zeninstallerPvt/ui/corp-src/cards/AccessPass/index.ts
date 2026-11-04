/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AccessPassCard from "./AccessPassCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    access_pass: true;
  }
}

export default {
  id: "access_pass",
  title: "Access pass",
  order: 160,
  cardRequirements: ["azure_login"],
  Component: AccessPassCard,
} satisfies CardModule;
