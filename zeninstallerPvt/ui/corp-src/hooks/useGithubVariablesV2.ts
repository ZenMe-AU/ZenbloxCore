/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback } from "react";
import type { ApiProvider } from "../api";
import type { Account } from "../types";
import type { UseGithubVariables } from "./useGithubVariables";
import { useGithubLoadable } from "./util/useGithubLoadable";

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

const noVariables = async (): Promise<Record<string, string>> => ({});

// ─── Hook ─────────────────────────────────────────────────────────────────────

// useGithubVariables for the V2 cards: the card passes where to read and which GitHub session to read through.
export function useGithubVariablesV2({ target, api }: UseGithubVariablesV2Params): UseGithubVariablesV2 {
  const { value: values, setValue: setValues, loading, refreshing, error, onRefresh } = useGithubLoadable({
    account: target?.account ?? null,
    repoName: target?.repoName ?? null,
    envName: target?.envName ?? null,
    emptyValue: {} as Record<string, string>,
    fetcher: api?.fetchVariables ?? noVariables,
  });

  const onConfirmed = useCallback(
    (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [setValues]
  );

  return { values, loading, refreshing, error, onRefresh, onConfirmed, api, target };
}
