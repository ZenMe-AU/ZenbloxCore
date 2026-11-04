/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import GithubSignupCard from "./GithubSignupCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    github_signup: true;
  }
}

export default {
  id: "github_signup",
  title: "GitHub Sign Up",
  order: 20,
  Component: GithubSignupCard,
} satisfies CardModule;
