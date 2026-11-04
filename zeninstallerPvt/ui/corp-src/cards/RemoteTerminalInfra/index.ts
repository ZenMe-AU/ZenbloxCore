/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import RemoteTerminalInfraCard from "./RemoteTerminalInfraCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    remote_terminal_infra: true;
  }
}

export default {
  id: "remote_terminal_infra",
  title: "Private Zeninstaller Backend Environment",
  order: 90,
  cardRequirements: ["azure_login", "azure_subscription"],
  Component: RemoteTerminalInfraCard,
} satisfies CardModule;
