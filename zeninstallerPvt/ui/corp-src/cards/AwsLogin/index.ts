/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AwsLoginCard from "./AwsLoginCard";

// Registers this card's id in CardId (types.ts collects every card's id).
declare module "../../types" {
  interface CardIdRegistry {
    aws_login: true;
  }
}

export default {
  id: "aws_login",
  title: "AWS login",
  order: 130,
  Component: AwsLoginCard,
} satisfies CardModule;
