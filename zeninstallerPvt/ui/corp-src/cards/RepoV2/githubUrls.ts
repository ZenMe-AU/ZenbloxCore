/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// GitHub web pages for Repository & environment 2, copied from logic/github.ts so the V2 card doesn't depend on V1 code.
// Other cards read the published links from AppContext (githubRepository) instead of importing these.

export function getGithubUserUrl(login: string): string {
  return `https://github.com/${login}`;
}

export function getRepoUrl(repoFullName: string): string {
  return `https://github.com/${repoFullName}`;
}

export function getEnvSettingsUrl(repoFullName: string, envId: number): string {
  return `https://github.com/${repoFullName}/settings/environments/${envId}/edit`;
}

export function getEnvironmentsUrl(repoFullName: string): string {
  return `https://github.com/${repoFullName}/settings/environments`;
}
