/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RepoApi } from "./api";
import type { GithubAccount, GithubBranch, GithubEnvironment, GithubRepositoryOption, RepoStatus } from "./types";
import { matchBranch } from "./env";
import { getEnvSettingsUrl } from "./githubUrls";
import { findIgnoreCase } from "../../logic/search";

export interface UseGithubEnvironment {
  envList: GithubEnvironment[];
  selectedEnv: GithubEnvironment | null;
  setSelectedEnv: (env: GithubEnvironment | null) => void;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  envsLoaded: boolean;
  envLoading: boolean;
  status: RepoStatus;
  envRefreshFailed: boolean;
  onRefresh: () => void;
}

export type UseGithubEnvironmentParams = {
  api: RepoApi | null;
  account: GithubAccount | null;
  repo: GithubRepositoryOption | null;
  isRepoReady: boolean;
  branches: GithubBranch[];
  initialEnvName?: string;
};

export function useGithubEnvironment(opts: UseGithubEnvironmentParams): UseGithubEnvironment {
  const queryKey = ["repo_v2", "environments", opts.account?.id, opts.repo?.id];
  const environmentsQuery = useQuery({
    queryKey,
    enabled: !!opts.api && !!opts.account && !!opts.repo && opts.isRepoReady,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await opts.api!.fetchEnvs(opts.account!, opts.repo!.name)).map((env): GithubEnvironment => ({
      name: env.name,
      id: env.id,
      settingsUrl: getEnvSettingsUrl(`${opts.account!.login}/${opts.repo!.name}`, env.id),
    })),
  });
  const envList = environmentsQuery.data ?? [];
  const key = `${opts.account?.id ?? ""}|${opts.repo?.id ?? ""}`;
  const [envPick, setEnvPick] = useState<{ api: RepoApi | null; key: string; env: GithubEnvironment | null } | null>(null);
  const selectedEnv = envPick?.api === opts.api && envPick.key === key
    ? envPick.env && envList.some((env) => env.id === envPick.env!.id) ? envPick.env : envPick.env === null ? null : null
    : opts.initialEnvName
      ? findIgnoreCase(envList, (env) => env.name, opts.initialEnvName) ?? null
      : null;

  const match = selectedEnv ? matchBranch(selectedEnv.name, opts.branches) : null;
  const branchMatchWarning = match?.status === "case"
    ? `Environment "${selectedEnv!.name}" and branch "${match.branch.name}" have mismatched casing.` : null;
  const branchMatchError = match?.status === "multiple"
    ? `Multiple branches match environment "${selectedEnv!.name}". Please resolve the conflict.`
    : match?.status === "none" ? `No branch found matching environment "${selectedEnv!.name}".` : null;
  const status: RepoStatus = !match ? "idle" : match.status === "exact" ? "complete" : "warning";

  return {
    envList,
    selectedEnv,
    setSelectedEnv: (env) => setEnvPick({ api: opts.api, key, env }),
    branchMatchWarning,
    branchMatchError,
    envsLoaded: !environmentsQuery.isPending,
    envLoading: environmentsQuery.isFetching,
    status: environmentsQuery.isError ? "error" : environmentsQuery.isFetching ? "loading" : status,
    envRefreshFailed: environmentsQuery.isError,
    onRefresh: () => { void environmentsQuery.refetch(); },
  };
}
