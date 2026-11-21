/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import type { CardHook, CardStatus } from "../../types";
import type { SharedCard, AppContext } from "../../appContext";
import type { BaseCardContext } from "../../components/BaseCard";
import { cardLifecycleReducer, initialCardLifecycle, type CardLifecycle, type CardLifecycleContext } from "../../components/basecardlifecycle";
import { createRepoApi } from "./api";
import { useGithubRepo, type UseGithubRepo } from "./useGithubRepo";
import { useGithubEnvironment, type UseGithubEnvironment } from "./useGithubEnvironment";
import { getEnvSettingsUrl } from "../../logic/github";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseRepoCardV2 extends CardHook {
  readonly cardId: "repo_v2";
  shared: SharedCard;
  baseCardContext: BaseCardContext;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Choose an environment")
  githubEnvUrl: string | undefined;
  repo: UseGithubRepo;
  env: UseGithubEnvironment;
}

function checkPrerequisites(appContext: ReturnType<AppContext["getSnapshot"]>) {
  const login = appContext.cards.github_login_v2;
  if (!login?.initialised || login.status !== "complete" || !login.githubAccount || !login.githubToken || !login.githubMode) return null;
  return { user: login.githubAccount, token: login.githubToken, mode: login.githubMode };
}

function reconcileLifecycle(context: CardLifecycleContext, phase: CardLifecycle): CardLifecycleContext {
  let current = context;
  const transition = (lifecycle: CardLifecycle) => {
    current = cardLifecycleReducer(current, { type: "transition", lifecycle });
  };
  if (current.lifecycle === phase) return current;
  if (current.lifecycle === "blocked" || current.lifecycle === "complete" || current.lifecycle === "error") transition("loading");
  if ((phase === "loading" || phase === "blocked" || phase === "ready") && current.lifecycle !== "loading") {
    transition("error");
    transition("loading");
  }
  if (phase === "blocked" || phase === "ready") transition(phase);
  if (phase === "action") transition("action");
  if (phase === "complete") {
    if (current.lifecycle === "ready") transition("action");
    if (current.lifecycle === "loading" || current.lifecycle === "action") transition("commit");
    transition("complete");
  }
  if (phase === "error") {
    if (current.lifecycle === "loading") transition("action");
    transition("error");
  }
  return current;
}

export function useRepoCardV2(appStore: AppContext): UseRepoCardV2 {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const prerequisites = checkPrerequisites(appContext);
  const token = prerequisites?.token;
  const mode = prerequisites?.mode;
  const user = prerequisites?.user ?? null;
  const api = useMemo(() => token && mode ? createRepoApi(token, mode) : null, [token, mode]);
  const githubRepo = useGithubRepo(user, api);
  const isRepoReady = !!user && !!githubRepo.selectedAccount && !!githubRepo.selectedRepo && !githubRepo.selectedRepo.isNew
    && githubRepo.status === "complete" && githubRepo.templateStatus === "ready";

  const env = useGithubEnvironment({
    api,
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
  const busySummary = api && !githubRepo.restore.account.ready ? "Loading GitHub accounts"
    : githubRepo.cloning ? "Cloning repository"
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
  const phase: CardLifecycle = !prerequisites ? "blocked" : errorSummary ? "error" : busySummary ? "action" : done ? "complete" : "ready";
  const [state, setState] = useState<{ phase: CardLifecycle; context: CardLifecycleContext }>({
    phase: "loading", context: initialCardLifecycle,
  });
  if (phase !== state.phase) setState({ phase, context: reconcileLifecycle(state.context, phase) });
  const baseCardContext = {
    cardId: "repo_v2", title: "Repository & environment 2",
    summary: phase === "blocked" ? "Sign in to GitHub login 2" : summary,
    ...state.context,
  } satisfies BaseCardContext;

  return {
    repo: githubRepo,
    env,
    githubEnvUrl,
    // cardHook
    cardId: "repo_v2" as const,
    baseCardContext,
    shared: {
      title: baseCardContext.title,
      status: baseCardContext.lifecycle,
      githubRepository: done && githubRepo.selectedAccount && githubRepo.selectedRepo && env.selectedEnv
        ? { account: githubRepo.selectedAccount, repository: githubRepo.selectedRepo, environment: env.selectedEnv }
        : null,
    },
    status,
    summary,
    cardRequirements: ["github_login_v2"],
    cardDependencyLabel: done ? null : isRepoReady ? "Choose an environment" : "Select a repository & environment",
    done,
  };
}
