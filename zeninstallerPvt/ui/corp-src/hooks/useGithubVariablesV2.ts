/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ApiProvider } from "../api";
import type { AppContext } from "../appContext";
import type { Account } from "../types";
import type { UseGithubVariables } from "./useGithubVariables";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VariableApi = Pick<ApiProvider, "fetchVariables" | "createVariable" | "updateVariable" | "deleteVariable">;

export type GithubTarget = { account: Account; repoName: string; envName: string; envUrl: string };

export type UseGithubVariablesV2Params = {
  target: GithubTarget | null; // Which environment's variables; nothing loads while null.
  api: VariableApi | null; // The card's GitHub session.
};

export interface UseGithubVariablesV2 extends UseGithubVariables {
  api: VariableApi | null; // Saving goes through the same session as loading.
  target: GithubTarget | null;
}

const emptyVariables: Record<string, string> = {};
export const githubVariablesQueryRoot = ["github_variables"] as const;

export function clearGithubVariablesCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: githubVariablesQueryRoot });
}

export function useGithubVariablesCacheSession(appStore: AppContext): void {
  const queryClient = useQueryClient();
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const githubLogin = appContext.cards.github_login_v2;
  const currentLogin = githubLogin?.initialised ? githubLogin.githubAccount?.login ?? null : null;
  const previousLogin = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousLogin.current;
    previousLogin.current = currentLogin;
    if (previous && previous !== currentLogin) clearGithubVariablesCache(queryClient);
  }, [currentLogin, queryClient]);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// useGithubVariables for the V2 cards: the card passes where to read and which GitHub session to read through.
export function useGithubVariablesV2({ target, api }: UseGithubVariablesV2Params): UseGithubVariablesV2 {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => [
    ...githubVariablesQueryRoot,
    target?.account.id,
    target?.repoName,
    target?.envName,
  ] as const, [target?.account.id, target?.repoName, target?.envName]);
  const query = useQuery({
    queryKey,
    enabled: !!target && !!api,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: "always",
    queryFn: () => api!.fetchVariables(target!.account, target!.repoName, target!.envName),
  });

  const onRefresh = useCallback(async () => {
    if (!target || !api) return;
    await query.refetch();
  }, [api, query, target]);

  const onConfirmed = useCallback(
    (key: string, value: string) => {
      queryClient.setQueryData<Record<string, string>>(queryKey, (previous = emptyVariables) => ({ ...previous, [key]: value }));
    },
    [queryClient, queryKey]
  );

  return {
    values: query.data ?? emptyVariables,
    loading: query.isPending && query.isFetching,
    refreshing: query.isFetching && !query.isPending,
    error: !!query.error,
    onRefresh,
    onConfirmed,
    api,
    target,
  };
}
