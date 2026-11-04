/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import CreateDomainCard from "./CreateDomainCard";

export default { order: 80, Component: CreateDomainCard } satisfies CardModule;
