/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import AwsLoginCard from "./AwsLoginCard";

export default { order: 130, Component: AwsLoginCard } satisfies CardModule;
