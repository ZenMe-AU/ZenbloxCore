/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import * as backend from "../../api/backend";
import { createGithubApi, type ApiProvider } from "../../api/github";
import type { SensitiveToken } from "../../appContext";

export type RepoApi = Pick<ApiProvider, "fetchOrgList" | "fetchRepos" | "checkTemplate" | "generateRepo" | "fetchBranches" | "createBranch" | "fetchEnvs">;

export function createRepoApi(token: SensitiveToken, mode: "direct" | "backend"): RepoApi {
  const value = token.reveal();
  if (mode === "direct") return createGithubApi(value);
  const auth = { token: value, expiryEvent: "auth:session-expired:github_login_v2" };
  return {
    fetchOrgList: () => backend.fetchOrgList(auth),
    fetchRepos: (account) => backend.fetchRepos(account, auth),
    checkTemplate: (account, repo) => backend.checkTemplate(account, repo, auth),
    generateRepo: (account, name, isPrivate, allBranches, createEnvs, template, envs) =>
      backend.generateRepo(account, name, isPrivate, allBranches, createEnvs, template, envs, auth),
    fetchBranches: (account, repo) => backend.fetchBranches(account, repo, auth),
    createBranch: (account, repo, branch, source) => backend.createBranch(account, repo, branch, source, auth),
    fetchEnvs: (account, repo) => backend.fetchEnvs(account, repo, auth),
  };
}
