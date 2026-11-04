/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import RemoteTerminalInfraCard from "./RemoteTerminalInfraCard";

export default { order: 90, Component: RemoteTerminalInfraCard } satisfies CardModule;
