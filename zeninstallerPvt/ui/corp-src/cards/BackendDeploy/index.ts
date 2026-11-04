/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import BackendDeployCard from "./BackendDeployCard";

export default { order: 100, Component: BackendDeployCard } satisfies CardModule;
