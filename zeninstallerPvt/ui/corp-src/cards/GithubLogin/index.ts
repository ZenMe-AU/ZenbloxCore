/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import GithubLoginCard from "./GithubLoginCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    github_login: true;
  }
}

export default {
  id: "github_login",
  title: "GitHub login",
  order: 10,
  Component: GithubLoginCard,
} satisfies CardModule;
