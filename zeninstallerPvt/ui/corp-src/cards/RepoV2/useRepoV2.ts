/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import type { SharedCard, AppContext } from "../../appContext";
import { checkPrerequisites, type BaseCardContext } from "../../components/useBaseCard";
import { createRepoApi } from "./api";
import { useGithubRepo, type UseGithubRepo } from "./useGithubRepo";
import { useGithubEnvironment, type UseGithubEnvironment } from "./useGithubEnvironment";
import {
  getRepoPrerequisites,
  getBaseCardContext,
  initialRepoCardContext,
  initialState,
  reducer,
  toBaseCardLifecycle,
  type Lifecycle,
} from "./stateMachine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrivateContext {
  appContext: ReturnType<AppContext["getSnapshot"]>;
  repo: UseGithubRepo;
  env: UseGithubEnvironment;
}

export interface UseRepoV2 {
  baseCardContext: BaseCardContext<Lifecycle>;
  privateContext: PrivateContext;
}

export function useRepoV2(appStore: AppContext): UseRepoV2 {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [state, dispatch] = useReducer(reducer, initialState);
  const prerequisiteContext = {
    ...initialRepoCardContext,
    lifecycle: toBaseCardLifecycle(state.lifecycle),
  } satisfies BaseCardContext<Lifecycle>;
  const prerequisites = getRepoPrerequisites(appContext, prerequisiteContext);
  const missingPrerequisites = checkPrerequisites(appContext, prerequisiteContext);
  const unmetCardPrerequisites = prerequisites
    ? missingPrerequisites
    : [...new Set([...missingPrerequisites, ...initialRepoCardContext.prerequisiteIds])];
  const token = prerequisites?.token;
  const mode = prerequisites?.mode;
  const user = prerequisites?.user ?? null;
  const [initialUrlParams] = useState(() => appContext.urlParams);
  const api = useMemo(() => token && mode ? createRepoApi(token, mode) : null, [token, mode]);
  const githubRepo = useGithubRepo(user, api, initialUrlParams.account, initialUrlParams.repo);
  const isRepoReady = !!user && !!githubRepo.selectedAccount && !!githubRepo.selectedRepo && !githubRepo.selectedRepo.isNew
    && githubRepo.status === "complete" && githubRepo.templateStatus === "ready";

  const env = useGithubEnvironment({
    api,
    account: githubRepo.selectedAccount,
    repo: githubRepo.selectedRepo,
    branches: githubRepo.branchList,
    isRepoReady: isRepoReady,
    initialEnvName: initialUrlParams.env,
  });

  const isEnvReady = !!env.selectedEnv && !env.branchMatchError && !env.envLoading && !env.envRefreshFailed && (env.status === "complete" || env.status === "warning");
  const envName = env.selectedEnv?.name;

  const errorSummary = githubRepo.cloneError || githubRepo.cloneEnvWarning || githubRepo.createBranchError || githubRepo.repoError
    || (githubRepo.repoRefreshFailed ? "Could not refresh repositories" : null)
    || (githubRepo.status === "error" ? "Could not verify repository" : null)
    || (isRepoReady && env.envRefreshFailed ? "Could not load environments" : null);
  const busySummary = api && !githubRepo.accountsLoaded ? "Loading GitHub accounts"
    : githubRepo.cloning ? "Cloning repository"
    : githubRepo.creatingBranch ? "Creating environment branch"
    : githubRepo.repoLoading ? "Refreshing repositories"
    : githubRepo.templateStatus === "ready" && githubRepo.status === "loading" ? "Loading repository branches"
    : githubRepo.selectedRepo && !githubRepo.selectedRepo.isNew && (githubRepo.templateStatus === "checking" || githubRepo.status === "loading") ? "Checking repository template"
    : isRepoReady && env.envLoading ? "Loading environments" : null;
  let summary: string;
  if (errorSummary) {
    summary = errorSummary;
  } else if (busySummary) {
    summary = busySummary;
  } else if (!user || !githubRepo.selectedAccount || !githubRepo.selectedRepo) {
    summary = "Select repository and environment";
  } else if (!isRepoReady) {
    summary = githubRepo.cloneValidationWarning || "Select or clone a supported template repository";
  } else if (env.branchMatchError || env.branchMatchWarning) {
    summary = env.branchMatchError || env.branchMatchWarning!;
  } else if (!envName) {
    summary = "Select an environment";
  } else {
    summary = `${githubRepo.repoFullName} · ${envName}`;
  }

  const done = isRepoReady && isEnvReady && !errorSummary && !busySummary;
  const lifecycle: Lifecycle = !prerequisites ? "blocked" : errorSummary ? "error" : busySummary ? "action" : done ? "complete" : "ready";
  const unmetChanged = state.baseCardContext.unmetCardPrerequisites.length !== unmetCardPrerequisites.length
    || state.baseCardContext.unmetCardPrerequisites.some((id, index) => id !== unmetCardPrerequisites[index]);
  if (state.lifecycle !== lifecycle || unmetChanged) {
    dispatch({ type: "sync", lifecycle, unmetCardPrerequisites });
  }
  const baseCardContext = getBaseCardContext(state, lifecycle === "blocked" ? "Sign in to GitHub login 2" : summary);
  useEffect(() => {
    if ((initialUrlParams.account && !githubRepo.accountsLoaded)
      || (initialUrlParams.repo && !githubRepo.reposLoaded)
      || (initialUrlParams.env && !env.envsLoaded)) return;
    const selectedRepo = githubRepo.selectedRepo && !githubRepo.selectedRepo.isNew ? githubRepo.selectedRepo : null;
    appStore.updateUrl({
      account: githubRepo.selectedAccount?.login,
      repo: selectedRepo?.name,
      env: env.selectedEnv?.name,
    });
  }, [appStore, initialUrlParams, githubRepo.accountsLoaded, githubRepo.reposLoaded, env.envsLoaded, githubRepo.selectedAccount?.login, githubRepo.selectedRepo, env.selectedEnv?.name]);
  useEffect(() => {
    const githubRepository = done && githubRepo.selectedAccount && githubRepo.selectedRepo && env.selectedEnv
      ? {
        account: {
          id: githubRepo.selectedAccount.id,
          login: githubRepo.selectedAccount.login,
          type: githubRepo.selectedAccount.type,
        },
        repository: { id: githubRepo.selectedRepo.id, name: githubRepo.selectedRepo.name },
        environment: { id: env.selectedEnv.id, name: env.selectedEnv.name, url: env.selectedEnv.url },
      }
      : null;
    appStore.update("repo_v2", {
      title: baseCardContext.title,
      currentBaseCardStatus: baseCardContext.lifecycle,
      currentStatus: state.lifecycle,
      githubRepository,
    } satisfies SharedCard<"repo_v2">);
  }, [appStore, baseCardContext.title, baseCardContext.lifecycle, state.lifecycle, done, githubRepo.selectedAccount, githubRepo.selectedRepo, env.selectedEnv]);

  return {
    baseCardContext,
    privateContext: {
      appContext,
      repo: githubRepo,
      env,
    },
  };
}
