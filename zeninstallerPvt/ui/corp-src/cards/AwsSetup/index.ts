/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AwsSetupCard from "./AwsSetupCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    aws_setup: true;
  }
}

export default {
  id: "aws_setup",
  title: "AWS setup",
  order: 140,
  cardRequirements: ["aws_login", "repo"],
  Component: AwsSetupCard,
} satisfies CardModule;
