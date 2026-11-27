/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RepoApi } from "./api";
import { TEMPLATE_REPO, VALID_ENVS } from "../../config/githubConfig";
import { getGithubUserUrl, getRepoUrl } from "./githubUrls";
import { findIgnoreCase } from "../../logic/search";
import type { GithubAccount, GithubBranch, GithubRepository, GithubRepositoryOption, GithubUser, RepoStatus } from "./types";

export interface UseGithubRepo {
  accountList: GithubAccount[];
  selectedAccount: GithubAccount | null;
  setSelectedAccount: (account: Omit<GithubAccount, "htmlUrl"> | null) => void; // Picked by id from accountList.
  repoList: GithubRepository[];
  selectedRepo: GithubRepositoryOption | null;
  setSelectedRepo: (repo: Omit<GithubRepositoryOption, "htmlUrl"> | null) => void;
  templateStatus: "checking" | "ready" | "not_clone" | "error";
  templateName: string | null;
  repoFullName: string | null;
  isPrivate: boolean;
  setIsPrivate: (value: boolean) => void;
  includeAllBranch: boolean;
  setIncludeAllBranch: (value: boolean) => void;
  cloning: boolean;
  cloneError: string | null;
  cloneValidationWarning?: string | null;
  createEnvs: boolean;
  setCreateEnvs: (value: boolean) => void;
  cloneEnvWarning: string | null;
  branchList: GithubBranch[];
  sourceBranch: string;
  setSourceBranch: (value: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  status: RepoStatus;
  accountsLoaded: boolean;
  reposLoaded: boolean;
  repoLoading: boolean;
  repoRefreshFailed: boolean;
  repoError?: string | null;
  onClone: () => Promise<void>;
  onRefresh: () => void;
  onCreateBranch: (targetName: string) => Promise<void>;
}

export function useGithubRepo(
  user: GithubUser | null,
  api: RepoApi | null,
  initialAccountLogin?: string,
  initialRepoName?: string,
): UseGithubRepo {
  const queryClient = useQueryClient();
  const userLogin = user?.login ?? null;
  const accountsQuery = useQuery({
    queryKey: ["repo_v2", "accounts", userLogin],
    enabled: !!userLogin && !!api,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await api!.fetchOrgList()).map((account) => ({ ...account, htmlUrl: getGithubUserUrl(account.login) })),
  });
  const accountList: GithubAccount[] = accountsQuery.data ?? [];
  const [accountPick, setAccountPick] = useState<{ userLogin: string | null; account: Omit<GithubAccount, "htmlUrl"> } | null>(null);
  const selectedAccount = accountPick && accountPick.userLogin === userLogin && accountList.some((account) => account.id === accountPick.account.id)
    ? accountList.find((account) => account.id === accountPick.account.id)!
    : (initialAccountLogin ? findIgnoreCase(accountList, (account) => account.login, initialAccountLogin) : undefined)
      ?? accountList[0] ?? null;

  const reposQuery = useQuery({
    queryKey: ["repo_v2", "repositories", userLogin, selectedAccount?.id],
    enabled: !!api && !!selectedAccount,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api!.fetchRepos(selectedAccount!),
  });
  const repoList: GithubRepository[] = reposQuery.data ?? [];
  const [repoPick, setRepoPick] = useState<{ userLogin: string | null; accountId: number; repo: GithubRepositoryOption } | null>(null);
  const selectedRepo: GithubRepositoryOption | null = repoPick && repoPick.userLogin === userLogin && repoPick.accountId === selectedAccount?.id
    ? repoPick.repo
    : initialRepoName
      ? (() => {
        const match = findIgnoreCase(repoList, (repo) => repo.name, initialRepoName);
        return match && selectedAccount ? { id: match.id, name: match.name, htmlUrl: getRepoUrl(`${selectedAccount.login}/${match.name}`) } : null;
      })()
      : null;

  const verificationQuery = useQuery({
    queryKey: ["repo_v2", "repository-verification", userLogin, selectedAccount?.id, selectedRepo && !selectedRepo.isNew ? selectedRepo.id : "new"],
    enabled: !!api && !!selectedAccount && !!selectedRepo && !selectedRepo.isNew,
    queryFn: async () => {
      const template = await api!.checkTemplate(selectedAccount!, selectedRepo!.name);
      const templateName = template.templateName || null;
      if (templateName !== TEMPLATE_REPO) {
        return { templateName, templateStatus: "not_clone" as const, branches: [] };
      }
      const branches = await api!.fetchBranches(selectedAccount!, selectedRepo!.name);
      return { templateName, templateStatus: "ready" as const, branches };
    },
  });
  const templateName = verificationQuery.data?.templateName ?? null;
  const templateStatus = verificationQuery.isError
    ? "error"
    : selectedRepo?.isNew || !selectedRepo
      ? "not_clone"
      : verificationQuery.data?.templateStatus ?? "checking";
  const [extraBranches, setExtraBranches] = useState<{ key: string; branches: GithubBranch[] }>({ key: "", branches: [] });
  const branchKey = `${selectedAccount?.id ?? ""}|${selectedRepo?.id ?? ""}`;
  const branchList = useMemo(
    () => {
      const branches = verificationQuery.data?.branches ?? [];
      return [...branches, ...(extraBranches.key === branchKey
        ? extraBranches.branches.filter((branch) => !branches.some((existing) => existing.name === branch.name))
        : [])];
    },
    [verificationQuery.data?.branches, extraBranches, branchKey]
  );
  const [sourceBranchPick, setSourceBranchPick] = useState<{ key: string; name: string } | null>(null);
  const sourceBranch = sourceBranchPick?.key === branchKey && branchList.some((branch) => branch.name === sourceBranchPick.name)
    ? sourceBranchPick.name
    : branchList.find((branch) => branch.name === "main")?.name ?? branchList[0]?.name ?? "";

  const [isPrivate, setIsPrivate] = useState(true);
  const [includeAllBranch, setIncludeAllBranch] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneValidationWarning, setCloneValidationWarning] = useState<string | null>(null);
  const [createEnvs, setCreateEnvs] = useState(true);
  const [cloneEnvWarning, setCloneEnvWarning] = useState<string | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);

  const onClone = useCallback(async () => {
    if (!api || !selectedAccount || !selectedRepo) return;
    const name = selectedRepo.name;
    if (findIgnoreCase(repoList, (repo) => repo.name, name)) {
      setCloneError(null);
      setCloneValidationWarning(`Repository "${name}" already exists. Select it or choose a different name.`);
      return;
    }
    setCloning(true);
    setCloneError(null);
    setCloneValidationWarning(null);
    setCloneEnvWarning(null);
    try {
      const result = await api.generateRepo(selectedAccount, name, isPrivate, includeAllBranch, createEnvs, TEMPLATE_REPO, VALID_ENVS);
      queryClient.setQueryData<GithubRepository[]>(
        ["repo_v2", "repositories", userLogin, selectedAccount.id],
        (current = []) => [...current, result.repo]
      );
      setRepoPick({ userLogin, accountId: selectedAccount.id, repo: { id: result.repo.id, name: result.repo.name, htmlUrl: getRepoUrl(`${selectedAccount.login}/${result.repo.name}`) } });
      if (!result.envSuccess) {
        setCloneEnvWarning(`Repo created but failed to create environments: ${result.results.envs.filter((env) => !env.success).map((env) => env.name).join(", ")}`);
      }
    } catch (error) {
      console.error("Failed to clone repository:", error);
      setCloneError(`Clone failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCloning(false);
    }
  }, [api, createEnvs, includeAllBranch, isPrivate, queryClient, repoList, selectedAccount, selectedRepo, userLogin]);

  const onRefresh = useCallback(() => {
    void accountsQuery.refetch();
    if (selectedAccount) void reposQuery.refetch();
    if (selectedRepo && !selectedRepo.isNew) void verificationQuery.refetch();
  }, [accountsQuery, reposQuery, selectedAccount, selectedRepo, verificationQuery]);

  const onCreateBranch = useCallback(async (targetName: string) => {
    if (!api || !selectedAccount || !selectedRepo) return;
    setCreatingBranch(true);
    setCreateBranchError(null);
    try {
      let source = sourceBranch;
      if (!source) {
        const refreshed = await verificationQuery.refetch({ throwOnError: true });
        const branches = refreshed.data?.branches;
        if (!branches) throw new Error("Repository branch refresh returned no data");
        source = branches.find((branch) => branch.name === "main")?.name ?? branches[0]?.name ?? "";
        if (branches.some((branch) => branch.name === targetName)) return;
        if (!source) {
          console.error("No source branch is available after refreshing repository branches.");
          setCreateBranchError("No source branch is available yet. Please try again.");
          return;
        }
      }
      const branch = await api.createBranch(selectedAccount, selectedRepo.name, targetName, source);
      setExtraBranches((current) => ({
        key: branchKey,
        branches: [...(current.key === branchKey ? current.branches : []), branch],
      }));
    } catch (error) {
      console.error("Failed to create branch:", error);
      setCreateBranchError(`Failed to create branch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreatingBranch(false);
    }
  }, [api, branchKey, selectedAccount, selectedRepo, sourceBranch, verificationQuery]);

  const repoError = accountsQuery.isError
    ? "Could not load GitHub accounts"
    : reposQuery.isError
      ? "Could not load repositories"
      : verificationQuery.isError
        ? `Could not verify repository template: ${verificationQuery.error instanceof Error ? verificationQuery.error.message : String(verificationQuery.error)}`
        : null;
  const status: RepoStatus = selectedRepo?.isNew ? "warning"
    : !selectedAccount || !selectedRepo ? "idle"
    : verificationQuery.isPending ? "loading"
    : verificationQuery.isError ? "error"
    : templateStatus === "ready" ? "complete" : "warning";

  return {
    accountList,
    selectedAccount,
    setSelectedAccount: (account) => {
      setAccountPick(account ? { userLogin, account } : null);
      setCloneError(null);
      setCloneValidationWarning(null);
      setCloneEnvWarning(null);
    },
    repoList,
    selectedRepo,
    setSelectedRepo: (repo) => {
      if (selectedAccount && repo) setRepoPick({ userLogin, accountId: selectedAccount.id, repo: { ...repo, htmlUrl: getRepoUrl(`${selectedAccount.login}/${repo.name}`) } });
      else setRepoPick(null);
      setCloneError(null);
      setCloneValidationWarning(null);
      setCloneEnvWarning(null);
    },
    templateStatus,
    templateName,
    repoFullName: selectedAccount && selectedRepo && !selectedRepo.isNew ? `${selectedAccount.login}/${selectedRepo.name}` : null,
    isPrivate,
    setIsPrivate,
    includeAllBranch,
    setIncludeAllBranch,
    cloning,
    cloneError,
    cloneValidationWarning,
    createEnvs,
    setCreateEnvs,
    cloneEnvWarning,
    branchList,
    sourceBranch,
    setSourceBranch: (name) => setSourceBranchPick({ key: branchKey, name }),
    creatingBranch,
    createBranchError,
    status,
    accountsLoaded: !accountsQuery.isPending,
    reposLoaded: !selectedAccount || !reposQuery.isPending,
    repoLoading: accountsQuery.isFetching || reposQuery.isFetching || verificationQuery.isFetching,
    repoRefreshFailed: accountsQuery.isError || reposQuery.isError,
    repoError,
    onClone,
    onRefresh,
    onCreateBranch,
  };
}
