/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RepoApi } from "./api";
import { type Account, type Branch, type CardStatus, type GhEnv, type RepoOption } from "../../types";
import { matchBranch } from "./env";
import { findIgnoreCase } from "../../logic/search";
import type { UrlRestoreField } from "../../hooks/useUrlStateManager";
// ─── Types ────────────────────────────────────────────────────────────────────
export interface UseGithubEnvironment {
  // Env
  envList: GhEnv[];
  selectedEnv: GhEnv | null;
  setSelectedEnv: (env: GhEnv | null) => void;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  // Status
  envLoading: boolean;
  status: CardStatus;
  envRefreshFailed: boolean;
  // Actions
  onRefresh: () => void;
  // Restore
  restore: {
    env: UrlRestoreField;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type UseGithubEnvironmentParams = {
  api: RepoApi | null;
  account: Account | null;
  repo: RepoOption | null;
  isRepoReady: boolean;
  branches: Branch[];
};

export function useGithubEnvironment(opts: UseGithubEnvironmentParams): UseGithubEnvironment {
  const apiRef = useRef(opts.api);
  const loadSequence = useRef(0);
  useLayoutEffect(() => {
    const sequence = loadSequence;
    apiRef.current = opts.api;
    sequence.current++;
    return () => { apiRef.current = null; sequence.current++; };
  }, [opts.api, opts.account?.id, opts.repo?.id]);
  const accountRef = useRef(opts.account);
  const repoRef = useRef(opts.repo);
  useEffect(() => {
    accountRef.current = opts.account;
    repoRef.current = opts.repo;
  });

  // ── Env state ─────────────────────────────────────────────────────────────
  const [envList, setEnvList] = useState<GhEnv[]>([]);
  const [envsLoaded, setEnvsLoaded] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<GhEnv | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [envRefreshFailed, setEnvRefreshFailed] = useState(false);
  const accountId = opts.account?.id ?? null;
  const repoId = opts.repo?.id ?? null;
  const [scope, setScope] = useState({ api: opts.api, accountId, repoId });
  if (scope.api !== opts.api || scope.accountId !== accountId || scope.repoId !== repoId) {
    setScope({ api: opts.api, accountId, repoId });
    setEnvList([]);
    setEnvsLoaded(false);
    setSelectedEnv(null);
    setRefreshing(false);
    setEnvRefreshFailed(false);
  }

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadEnvs = useCallback(async (account: Account, repo: RepoOption) => {
    const api = opts.api;
    if (!api) return;
    const sequence = ++loadSequence.current;
    try {
      const list = await api.fetchEnvs(account, repo.name);
      if (apiRef.current === api && loadSequence.current === sequence) {
        setEnvList(list);
        setEnvRefreshFailed(false);
      }
    } catch (e) {
      if (apiRef.current === api && loadSequence.current === sequence) {
        console.error(e);
        setEnvRefreshFailed(true);
      }
    } finally {
      if (apiRef.current === api && loadSequence.current === sequence) {
        setRefreshing(false);
        setEnvsLoaded(true);
      }
    }
  }, [opts.api]);

  // Load envs when repo is ready
  useEffect(() => {
    if (!opts.account || !opts.repo || !opts.isRepoReady) return;
    loadEnvs(opts.account, opts.repo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.account?.id, opts.repo?.id, opts.isRepoReady, loadEnvs]);

  const match = selectedEnv ? matchBranch(selectedEnv.name, opts.branches) : null;
  const branchMatchWarning = match?.status === "case"
    ? `Environment "${selectedEnv!.name}" and branch "${match.branch.name}" have mismatched casing.` : null;
  const branchMatchError = match?.status === "multiple"
    ? `Multiple branches match environment "${selectedEnv!.name}". Please resolve the conflict.`
    : match?.status === "none" ? `No branch found matching environment "${selectedEnv!.name}".` : null;
  const envLoading = refreshing || (!!opts.api && opts.isRepoReady && !envsLoaded);
  const status: CardStatus = !match ? "idle" : match.status === "exact" ? "complete" : "warning";

  // ── Actions ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    const acc = accountRef.current;
    const repo = repoRef.current;
    if (acc && repo) {
      setRefreshing(true);
      setEnvRefreshFailed(false);
      loadEnvs(acc, repo);
    }
  }, [loadEnvs]);

  const restoreEnv = useCallback(
    (value: string): boolean => {
      const match = findIgnoreCase(envList, (e) => e.name, value);
      if (!match) return false;
      setSelectedEnv(match);
      return true;
    },
    [envList]
  );

  return {
    // Env
    envList,
    selectedEnv,
    setSelectedEnv,
    branchMatchWarning,
    branchMatchError,
    // Status
    envLoading,
    status: envRefreshFailed ? "error" : envLoading ? "loading" : status,
    envRefreshFailed,
    // Actions
    onRefresh,
    // Restore
    restore: {
      env: { ready: envsLoaded, scope: opts.repo?.id ?? null, apply: restoreEnv },
    },
  };
}
