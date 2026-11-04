/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import WebDeployCard from "./WebDeployCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    web_deploy: true;
  }
}

export default {
  id: "web_deploy",
  title: "Private Zeninstaller Frontend",
  order: 120,
  cardRequirements: ["github_login", "repo", "azure_login", "private_frontend_infra"],
  Component: WebDeployCard,
} satisfies CardModule;
