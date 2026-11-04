/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardModule } from "../../hooks/useCards";
import GithubSignupCard from "./GithubSignupCard";

export default { order: 20, Component: GithubSignupCard } satisfies CardModule;
