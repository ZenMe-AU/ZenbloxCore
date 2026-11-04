/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AzureAppRegistrationCard from "./AzureAppRegistrationCard";

export default { order: 60, Component: AzureAppRegistrationCard } satisfies CardModule;
