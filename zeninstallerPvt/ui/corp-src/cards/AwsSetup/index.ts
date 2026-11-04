/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AwsSetupCard from "./AwsSetupCard";

export default { order: 140, Component: AwsSetupCard } satisfies CardModule;
