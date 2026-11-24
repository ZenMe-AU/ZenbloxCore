/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RepoApi } from "./api";
import { TEMPLATE_REPO, VALID_ENVS } from "../../config/githubConfig";
import { findIgnoreCase } from "../../logic/search";
import type { GithubAccount, GithubBranch, GithubRepository, GithubRepositoryOption, GithubUser, RepoStatus } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseGithubRepo {
  // Account
  accountList: GithubAccount[];
  selectedAccount: GithubAccount | null;
  setSelectedAccount: (a: GithubAccount | null) => void;
  // Repository
  repoList: GithubRepository[];
  selectedRepo: GithubRepositoryOption | null;
  setSelectedRepo: (r: GithubRepositoryOption | null) => void;
  // Template
  templateStatus: "checking" | "ready" | "not_clone" | "error";
  templateName: string | null;
  repoFullName: string | null;
  // Clone
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  includeAllBranch: boolean;
  setIncludeAllBranch: (v: boolean) => void;
  cloning: boolean;
  cloneError: string | null;
  cloneValidationWarning?: string | null;
  createEnvs: boolean;
  setCreateEnvs: (v: boolean) => void;
  cloneEnvWarning: string | null;
  // Branch
  branchList: GithubBranch[];
  sourceBranch: string;
  setSourceBranch: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  // Status
  status: RepoStatus;
  accountsLoaded: boolean;
  reposLoaded: boolean;
  repoLoading: boolean;
  repoRefreshFailed: boolean;
  repoError?: string | null;
  // Actions
  onClone: () => Promise<void>;
  onRefresh: () => void;
  onCreateBranch: (targetName: string) => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/*
 * The GitHub account/repo/clone/branch layer — not a card. Shared by the repo card
 * (which just needs status) and useGithubEnvironment (which needs the account,
 * selected repo, and branches to load environments and match a branch).
 */
export function useGithubRepo(
  user: GithubUser | null,
  api: RepoApi | null,
  initialAccountLogin?: string,
  initialRepoName?: string,
): UseGithubRepo {
  // ── State ─────────────────────────────────────────────────────────────────
  const [accountList, setAccountList] = useState<GithubAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<GithubAccount | null>(null);
  const [repoList, setRepoList] = useState<GithubRepository[]>([]);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GithubRepositoryOption | null>(null);

  const [templateStatus, setTemplateStatus] = useState<UseGithubRepo["templateStatus"]>("not_clone");
  const [templateName, setTemplateName] = useState<string | null>(null);

  const [isPrivate, setIsPrivate] = useState(true);
  const [includeAllBranch, setIncludeAllBranch] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneValidationWarning, setCloneValidationWarning] = useState<string | null>(null);
  const [createEnvs, setCreateEnvs] = useState(true);
  const [cloneEnvWarning, setCloneEnvWarning] = useState<string | null>(null);

  const [branchList, setBranchList] = useState<GithubBranch[]>([]);
  const [sourceBranch, setSourceBranch] = useState<string>("main");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);

  const [status, setStatus] = useState<RepoStatus>("idle");
  const [verifiedSelection, setVerifiedSelection] = useState<{ accountId: GithubAccount["id"]; repoId: GithubRepositoryOption["id"] } | null>(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoRefreshFailed, setRepoRefreshFailed] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const repoCheckSequence = useRef(0);

  // Pure cache to avoid refetching a repo list already seen this session — never rendered directly.
  const repoCache = useRef<Record<string, GithubRepository[]>>({});
  const initialAccountApplied = useRef(false);
  const initialRepoApplied = useRef(false);
  const apiRef = useRef(api);
  useLayoutEffect(() => {
    const sequence = repoCheckSequence;
    apiRef.current = api;
    repoCache.current = {};
    sequence.current++;
    return () => { apiRef.current = null; sequence.current++; };
  }, [api]);
  const [scope, setScope] = useState(api);
  if (scope !== api) {
    setScope(api);
    setAccountList([]);
    setAccountsLoaded(false);
    setSelectedAccount(null);
    setRepoList([]);
    setReposLoaded(false);
    setSelectedRepo(null);
    setTemplateStatus("not_clone");
    setTemplateName(null);
    setCloning(false);
    setCloneError(null);
    setCloneValidationWarning(null);
    setCloneEnvWarning(null);
    setBranchList([]);
    setSourceBranch("main");
    setCreatingBranch(false);
    setCreateBranchError(null);
    setStatus("idle");
    setVerifiedSelection(null);
    setRepoLoading(false);
    setRepoRefreshFailed(false);
    setRepoError(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const isNewRepo = selectedRepo?.isNew ?? false;
  const repoFullName = selectedAccount && selectedRepo && !isNewRepo ? `${selectedAccount.login}/${selectedRepo.name}` : null;

  // Auto-clear clone error when a different repo is selected
  useEffect(() => {
    setCloneError(null);
    setCloneValidationWarning(null);
  }, [selectedRepo?.id]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const checkSelectedRepo = useCallback(
    async (account: GithubAccount | null, repo: GithubRepositoryOption | null) => {
      const sequence = ++repoCheckSequence.current;
      setTemplateStatus(account && repo && !repo.isNew ? "checking" : "not_clone");
      setTemplateName(null);
      setBranchList([]);
      setCreateBranchError(null);
      setRepoError(null);
      if (!api || !account || !repo || repo.isNew) {
        setStatus(repo?.isNew ? "warning" : "idle");
        return;
      }
      setStatus("loading");
      let verifiedTemplate = false;
      try {
        const data = await api.checkTemplate(account, repo.name);
        if (apiRef.current !== api || sequence !== repoCheckSequence.current) return;
        const tName = data.templateName || null;
        setTemplateName(tName);
        const isTemplate = tName !== null && tName === TEMPLATE_REPO;
        if (!isTemplate) {
          setTemplateStatus("not_clone");
          setStatus("warning");
          return;
        }

        verifiedTemplate = true;
        setTemplateStatus("ready");
        const list = await api.fetchBranches(account, repo.name);
        if (apiRef.current !== api || sequence !== repoCheckSequence.current) return;
        setBranchList(list);
        setSourceBranch(list.find((branch) => branch.name === "main")?.name ?? list[0]?.name ?? "");
        setVerifiedSelection({ accountId: account.id, repoId: repo.id });
        setStatus("complete");
      } catch (e) {
        if (apiRef.current !== api || sequence !== repoCheckSequence.current) return;
        console.error(verifiedTemplate ? "Failed to fetch branches:" : "Failed to check template:", e);
        setRepoError(`${verifiedTemplate ? "Could not load repository branches" : "Could not verify repository template"}: ${e instanceof Error ? e.message : String(e)}`);
        setTemplateStatus(verifiedTemplate ? "ready" : "error");
        setStatus("error");
      }
    },
    [api]
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  // Load organizations once user authenticates
  const userLogin = user?.login;
  useEffect(() => {
    if (!userLogin || !api) return;
    let cancelled = false;
    api.fetchOrgList()
      .then((data) => {
        if (cancelled || apiRef.current !== api) return;
        setAccountList(data);
        const initialAccount = !initialAccountApplied.current && initialAccountLogin
          ? findIgnoreCase(data, (account) => account.login, initialAccountLogin)
          : undefined;
        initialAccountApplied.current = true;
        setSelectedAccount(initialAccount ?? data[0] ?? null);
      })
      .catch((error) => {
        if (cancelled || apiRef.current !== api) return;
        console.error(error);
        setRepoError("Could not load GitHub accounts");
      })
      .finally(() => { if (!cancelled && apiRef.current === api) setAccountsLoaded(true); });
    return () => { cancelled = true; };
  }, [userLogin, api, initialAccountLogin]);

  // Load repositories when account changes
  useEffect(() => {
    setRepoList([]);
    setSelectedRepo(null);
    setStatus("idle");
    setReposLoaded(false);
    setRepoLoading(false);
    setRepoError(null);
    setRepoRefreshFailed(false);
    setCloneError(null);
    setCloneEnvWarning(null);
    setCreateBranchError(null);
    if (!selectedAccount || !api) return;
    const key = String(selectedAccount.id);
    if (repoCache.current[key]) {
      const list = repoCache.current[key];
      setRepoList(list);
      const initialRepo = !initialRepoApplied.current && initialRepoName
        ? list.find((repo) => repo.name.toLowerCase() === initialRepoName.toLowerCase())
        : undefined;
      initialRepoApplied.current = true;
      if (initialRepo) setSelectedRepo({ id: initialRepo.id, name: initialRepo.name });
      setReposLoaded(true);
      return;
    }
    let cancelled = false;
    setRepoLoading(true);
    api.fetchRepos(selectedAccount)
      .then((list) => {
        if (apiRef.current !== api) return;
        repoCache.current[key] = list;
        if (!cancelled) {
          setRepoList(list);
          const initialRepo = !initialRepoApplied.current && initialRepoName
            ? list.find((repo) => repo.name.toLowerCase() === initialRepoName.toLowerCase())
            : undefined;
          initialRepoApplied.current = true;
          if (initialRepo) setSelectedRepo({ id: initialRepo.id, name: initialRepo.name });
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled && apiRef.current === api) {
          setRepoRefreshFailed(true);
          setRepoError("Could not load repositories");
        }
      })
      .finally(() => {
        if (!cancelled && apiRef.current === api) {
          setReposLoaded(true);
          setRepoLoading(false);
        }
      });
    setTemplateName(null);
    return () => {
      cancelled = true;
    };
  }, [selectedAccount, api, initialRepoName]);

  // Check selected repository
  useEffect(() => {
    checkSelectedRepo(selectedAccount, selectedRepo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepo?.id, selectedAccount?.id, checkSelectedRepo]);

  // ── Stable refs (for callbacks below that shouldn't re-create on every state change) ──
  const repoListRef = useRef(repoList);
  const selectedAccountRef = useRef(selectedAccount);
  const selectedRepoRef = useRef(selectedRepo);
  const sourceBranchRef = useRef(sourceBranch);
  useLayoutEffect(() => {
    repoListRef.current = repoList;
    selectedAccountRef.current = selectedAccount;
    selectedRepoRef.current = selectedRepo;
    sourceBranchRef.current = sourceBranch;
  });

  // ── Actions ───────────────────────────────────────────────────────────────
  const onClone = useCallback(async () => {
    const acc = selectedAccountRef.current;
    const repo = selectedRepoRef.current;
    if (!api || !acc || !repo) return;
    const name = repo.name;
    if (repoListRef.current.find((r) => r.name === name)) {
      setCloneError(null);
      setCloneValidationWarning(`Repository "${name}" already exists. Select it or choose a different name.`);
      return;
    }
    setCloning(true);
    setCloneError(null);
    setCloneValidationWarning(null);
    setCloneEnvWarning(null);
    try {
      const { repo: newRepo, envSuccess, results } = await api.generateRepo(acc, name, isPrivate, includeAllBranch, createEnvs, TEMPLATE_REPO, VALID_ENVS);
      if (apiRef.current !== api) return;
      const updated = [...repoListRef.current, newRepo];
      setRepoList(updated);
      repoCache.current[String(acc.id)] = updated;
      setSelectedRepo({ id: newRepo.id, name: newRepo.name });
      if (!envSuccess) {
        const failed = results.envs.filter((e) => !e.success).map((e) => e.name);
        setCloneEnvWarning(`Repo created but failed to create environments: ${failed.join(", ")}`);
      }
    } catch {
      if (apiRef.current === api) setCloneError("Clone failed");
    } finally {
      if (apiRef.current === api) setCloning(false);
    }
  }, [api, isPrivate, includeAllBranch, createEnvs]);

  const onRefresh = useCallback(() => {
    const acc = selectedAccountRef.current;
    if (!api || (!acc && !user)) return;
    setRepoLoading(true);
    setRepoRefreshFailed(false);
    setRepoError(null);
    setCloneEnvWarning(null);
    setStatus("loading");
    if (acc) delete repoCache.current[String(acc.id)];
    Promise.all([api.fetchOrgList(), acc ? api.fetchRepos(acc) : Promise.resolve([])])
      .then(async ([orgs, list]) => {
        if (apiRef.current !== api || selectedAccountRef.current?.id !== acc?.id) return;
        setAccountList(orgs);
        if (!acc) {
          const initialAccount = !initialAccountApplied.current && initialAccountLogin
            ? findIgnoreCase(orgs, (account) => account.login, initialAccountLogin)
            : undefined;
          initialAccountApplied.current = true;
          setSelectedAccount(initialAccount ?? orgs[0] ?? null);
          return;
        }
        setRepoList(list);
        repoCache.current[String(acc.id)] = list;
        setRepoError(null);
        await checkSelectedRepo(acc, selectedRepoRef.current);
      })
      .catch((e) => {
        if (apiRef.current !== api) return;
        console.error(e);
        setRepoRefreshFailed(true);
        setRepoError("Could not refresh repositories");
      })
      .finally(() => { if (apiRef.current === api) setRepoLoading(false); });
  }, [api, checkSelectedRepo, user, initialAccountLogin]);

  const onCreateBranch = useCallback(async (targetName: string) => {
    const acc = selectedAccountRef.current;
    const repo = selectedRepoRef.current;
    if (!api || !acc || !repo) return;
    setCreatingBranch(true);
    setCreateBranchError(null);
    try {
      const newBranch = await api.createBranch(acc, repo.name, targetName, sourceBranchRef.current);
      if (apiRef.current !== api) return;
      setBranchList((prev) => [...prev, newBranch]);
    } catch {
      if (apiRef.current === api) setCreateBranchError("Failed to create branch");
    } finally {
      if (apiRef.current === api) setCreatingBranch(false);
    }
  }, [api]);

  return {
    // Account
    accountList,
    selectedAccount,
    setSelectedAccount,
    // Repository
    repoList,
    selectedRepo,
    setSelectedRepo: (repo) => {
      setCloneEnvWarning(null);
      setSelectedRepo(repo);
    },
    // Template
    templateStatus,
    templateName,
    repoFullName,
    // Clone
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
    // Branch
    branchList,
    sourceBranch,
    setSourceBranch,
    creatingBranch,
    createBranchError,
    // Status
    status: status === "complete" && selectedAccount && selectedRepo
      && (verifiedSelection?.accountId !== selectedAccount.id || verifiedSelection.repoId !== selectedRepo.id)
      ? "loading" : status,
    repoLoading,
    repoRefreshFailed,
    repoError,
    // Actions
    onClone,
    onRefresh,
    onCreateBranch,
      accountsLoaded,
      reposLoaded,
  };
}
