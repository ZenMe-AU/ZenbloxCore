/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import BackendDeployCard from "./BackendDeployCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    backend_deploy: true;
  }
}

export default {
  id: "backend_deploy",
  title: "Private Zeninstaller Backend",
  order: 100,
  cardRequirements: ["github_login", "repo", "azure_login", "remote_terminal_infra"],
  Component: BackendDeployCard,
} satisfies CardModule;
