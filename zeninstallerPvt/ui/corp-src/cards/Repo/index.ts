/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import RepoCard from "./RepoCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    repo: true;
  }
}

export default {
  id: "repo",
  title: "Repository & environment",
  order: 30,
  cardRequirements: ["github_login"],
  Component: RepoCard,
} satisfies CardModule;
