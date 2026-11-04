/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import CoreInfraCard from "./CoreInfraCard";

export default { order: 70, Component: CoreInfraCard } satisfies CardModule;
