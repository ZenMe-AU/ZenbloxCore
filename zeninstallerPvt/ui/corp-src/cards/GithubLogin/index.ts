/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import GithubLoginCard from "./GithubLoginCard";

export default { order: 10, Component: GithubLoginCard } satisfies CardModule;
