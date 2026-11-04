/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AzureLoginCard from "./AzureLoginCard";

export default { order: 40, Component: AzureLoginCard } satisfies CardModule;
