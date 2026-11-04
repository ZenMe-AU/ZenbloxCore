/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import PrivateFrontendInfraCard from "./PrivateFrontendInfraCard";

export default { order: 110, Component: PrivateFrontendInfraCard } satisfies CardModule;
