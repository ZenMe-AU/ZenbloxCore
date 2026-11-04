/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import WebDeployCard from "./WebDeployCard";

export default { order: 120, Component: WebDeployCard } satisfies CardModule;
