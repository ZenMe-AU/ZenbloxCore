/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useMemo, useReducer, useSyncExternalStore } from "react";
import type { CardHook, CardStatus } from "../../types";
import type { SharedCard, AppContext } from "../../appContext";
import type { BaseCardContext } from "../../components/useBaseCard";
import { createRepoApi } from "./api";
import { useGithubRepo, type UseGithubRepo } from "./useGithubRepo";
import { useGithubEnvironment, type UseGithubEnvironment } from "./useGithubEnvironment";
import { getEnvSettingsUrl } from "../../logic/github";
import {
  getRepoPrerequisites,
  initialRepoCardContext,
  initialState,
  reducer,
  stateGraph,
  toBaseCardLifecycle,
  type Lifecycle,
} from "./stateMachine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseRepoCardV2 extends CardHook {
  readonly cardId: "repo_v2";
  shared: SharedCard<"repo_v2">;
  baseCardContext: BaseCardContext<Lifecycle>;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Choose an environment")
  githubEnvUrl: string | undefined;
  repo: UseGithubRepo;
  env: UseGithubEnvironment;
}

export function useRepoCardV2(appStore: AppContext): UseRepoCardV2 {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [state, dispatchLifecycle] = useReducer(reducer, initialState);
  const initialBaseCardContext = {
    ...initialRepoCardContext,
    lifecycle: toBaseCardLifecycle(state.lifecycle),
    stateMachine: { graph: stateGraph, currentState: state.lifecycle },
  } satisfies BaseCardContext<Lifecycle>;
  const prerequisites = getRepoPrerequisites(appContext, initialBaseCardContext);
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
  const lifecycle: Lifecycle = !prerequisites ? "blocked" : errorSummary ? "error" : busySummary ? "action" : done ? "complete" : "ready";
  if (lifecycle !== state.lifecycle) dispatchLifecycle({ type: "transition", lifecycle });
  const sharedGithubRepository = done && githubRepo.selectedAccount && githubRepo.selectedRepo && env.selectedEnv
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
  const baseCardContext = {
    ...initialRepoCardContext,
    lifecycle: toBaseCardLifecycle(lifecycle),
    stateMachine: { graph: stateGraph, currentState: lifecycle },
    summary: lifecycle === "blocked" ? "Sign in to GitHub login 2" : summary,
  } satisfies BaseCardContext<Lifecycle>;

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
      githubRepository: sharedGithubRepository,
    } satisfies SharedCard<"repo_v2">,
    status,
    summary,
    cardDependencyLabel: baseCardContext.title,
    done,
  };
}
