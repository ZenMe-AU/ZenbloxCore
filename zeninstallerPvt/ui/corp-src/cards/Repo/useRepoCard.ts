/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardHook, CardStatus, User } from "../../types";
import type { SharedCard } from "../../appContext";
import { useGithubRepo, type UseGithubRepo } from "./useGithubRepo";
import { useGithubEnvironment, type UseGithubEnvironment } from "./useGithubEnvironment";
import { getEnvSettingsUrl } from "../../logic/github";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseRepoCardParams = {
  user: User | null;
};

export interface UseRepoCard extends CardHook {
  readonly cardId: "repo";
  shared: SharedCard;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Choose an environment")
  githubEnvUrl: string | undefined;
  repo: UseGithubRepo;
  env: UseGithubEnvironment;
}

export function useRepoCard({ user }: UseRepoCardParams): UseRepoCard {
  const githubRepo = useGithubRepo(user);
  const isRepoReady = !!user && !!githubRepo.selectedAccount && !!githubRepo.selectedRepo && githubRepo.status === "complete" && githubRepo.templateStatus === "ready";

  const env = useGithubEnvironment({
    account: githubRepo.selectedAccount,
    repo: githubRepo.selectedRepo,
    branches: githubRepo.branchList,
    isRepoReady: isRepoReady,
  });

  const isEnvReady = !!env.selectedEnv && !env.branchMatchError && !env.envLoading && !env.envRefreshFailed && (env.status === "complete" || env.status === "warning");
  const envName = env.selectedEnv?.name;

  const errorSummary = githubRepo.cloneError || githubRepo.cloneEnvWarning || githubRepo.createBranchError || githubRepo.repoError
    || (githubRepo.repoRefreshFailed ? "Could not refresh repositories" : null)
    || (githubRepo.status === "error" ? "Could not verify repository" : null)
    || (isRepoReady && env.envRefreshFailed ? "Could not load environments" : null);
  const busySummary = githubRepo.cloning ? "Cloning repository"
    : githubRepo.creatingBranch ? "Creating environment branch"
    : githubRepo.repoLoading ? "Refreshing repositories"
    : githubRepo.templateStatus === "ready" && githubRepo.status === "loading" ? "Loading repository branches"
    : githubRepo.selectedRepo && !githubRepo.selectedRepo.isNew && (githubRepo.templateStatus === "checking" || githubRepo.status === "loading") ? "Checking repository template"
    : isRepoReady && env.envLoading ? "Loading environments" : null;
  let status: CardStatus;
  let summary: string;
  if (errorSummary) {
    status = "error";
    summary = errorSummary;
  } else if (busySummary) {
    status = "loading";
    summary = busySummary;
  } else if (!user || !githubRepo.selectedAccount || !githubRepo.selectedRepo) {
    status = "idle";
    summary = "Select repository and environment";
  } else if (!isRepoReady) {
    status = "warning";
    summary = githubRepo.cloneValidationWarning || "Select or clone a supported template repository";
  } else if (env.branchMatchError || env.branchMatchWarning) {
    status = "warning";
    summary = env.branchMatchError || env.branchMatchWarning!;
  } else if (!envName) {
    status = "warning";
    summary = "Select an environment";
  } else {
    status = "complete";
    summary = `${githubRepo.repoFullName} · ${envName}`;
  }

  const githubEnvUrl = githubRepo.repoFullName && env.selectedEnv ? getEnvSettingsUrl(githubRepo.repoFullName, env.selectedEnv.id) : undefined;
  const done = isRepoReady && isEnvReady && !errorSummary && !busySummary;

  return {
    repo: githubRepo,
    env,
    githubEnvUrl,
    // cardHook
    cardId: "repo" as const,
    shared: { title: "Repository & environment", status },
    status,
    summary,
    cardRequirements: ["github_login"],
    cardDependencyLabel: done ? null : isRepoReady ? "Choose an environment" : "Select a repository & environment",
    done,
  };
}
