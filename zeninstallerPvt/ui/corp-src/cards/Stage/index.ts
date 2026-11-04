/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import StageCards from "./StageCards";

// Registers the group's id, which only config/cardOrder.ts uses. No card reports it, so never list it in cardRequirements.
declare module "../../types" {
  interface CardIdRegistry {
    stages: true;
  }
}

export default {
  id: "stages",
  title: "Pipeline stages",
  order: 150,
  Component: StageCards,
} satisfies CardModule;
