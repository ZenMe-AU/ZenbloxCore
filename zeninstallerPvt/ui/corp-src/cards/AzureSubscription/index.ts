/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AzureSubscriptionCard from "./AzureSubscriptionCard";

export default { order: 50, Component: AzureSubscriptionCard } satisfies CardModule;
