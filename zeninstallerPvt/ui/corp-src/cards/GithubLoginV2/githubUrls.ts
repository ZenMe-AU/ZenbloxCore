/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// GitHub web pages for GitHub login 2, copied from logic/github.ts so the V2 card doesn't depend on V1 code.

export const GITHUB_LOGIN_URL = "https://github.com/login";

export function getGithubUserUrl(login: string): string {
  return `https://github.com/${login}`;
}
