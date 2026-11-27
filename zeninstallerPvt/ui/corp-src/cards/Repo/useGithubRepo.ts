/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { checkTemplate, createBranch, fetchBranches, fetchOrgList, fetchRepos, generateRepo } from "../../api";
import { TEMPLATE_REPO, VALID_ENVS } from "../../config/githubConfig";
import { findIgnoreCase } from "../../logic/search";
import { INITIAL_URL_PARAMS, type UrlRestoreField } from "../../hooks/useUrlStateManager";
import type { Account, Branch, CardStatus, Repo, RepoOption, User } from "../../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseGithubRepo {
  // Account
  accountList: Account[];
  selectedAccount: Account | null;
  setSelectedAccount: (a: Account | null) => void;
  // Repository
  repoList: Repo[];
  selectedRepo: RepoOption | null;
  setSelectedRepo: (r: RepoOption | null) => void;
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
  branchList: Branch[];
  sourceBranch: string;
  setSourceBranch: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  // Status
  status: CardStatus;
  repoLoading: boolean;
  repoRefreshFailed: boolean;
  repoError?: string | null;
  // Actions
  onClone: () => Promise<void>;
  onRefresh: () => void;
  onCreateBranch: (targetName: string) => Promise<void>;
  // Restore
  restore: {
    account: UrlRestoreField;
    repo: UrlRestoreField;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/*
 * The GitHub account/repo/clone/branch layer — not a card. Shared by the repo card
 * (which just needs status) and useGithubEnvironment (which needs the account,
 * selected repo, and branches to load environments and match a branch).
 */
export function useGithubRepo(user: User | null): UseGithubRepo {
  // ── State ─────────────────────────────────────────────────────────────────
  const [accountList, setAccountList] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [repoList, setRepoList] = useState<Repo[]>([]);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  const [templateStatus, setTemplateStatus] = useState<UseGithubRepo["templateStatus"]>("not_clone");
  const [templateName, setTemplateName] = useState<string | null>(null);

  const [isPrivate, setIsPrivate] = useState(true);
  const [includeAllBranch, setIncludeAllBranch] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneValidationWarning, setCloneValidationWarning] = useState<string | null>(null);
  const [createEnvs, setCreateEnvs] = useState(true);
  const [cloneEnvWarning, setCloneEnvWarning] = useState<string | null>(null);

  const [branchList, setBranchList] = useState<Branch[]>([]);
  const [sourceBranch, setSourceBranch] = useState<string>("main");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);

  const [status, setStatus] = useState<CardStatus>("idle");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoRefreshFailed, setRepoRefreshFailed] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const repoCheckSequence = useRef(0);

  // Pure cache to avoid refetching a repo list already seen this session — never rendered directly.
  const repoCache = useRef<Record<string, Repo[]>>({});

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
    async (account: Account | null, repo: RepoOption | null) => {
      const sequence = ++repoCheckSequence.current;
      setTemplateStatus(account && repo && !repo.isNew ? "checking" : "not_clone");
      setTemplateName(null);
      setBranchList([]);
      setCreateBranchError(null);
      setRepoError(null);
      if (!account || !repo || repo.isNew) {
        setStatus(repo?.isNew ? "warning" : "idle");
        return;
      }
      setStatus("loading");
      let verifiedTemplate = false;
      try {
        const data = await checkTemplate(account, repo.name);
        if (sequence !== repoCheckSequence.current) return;
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
        const list = await fetchBranches(account, repo.name);
        if (sequence !== repoCheckSequence.current) return;
        setBranchList(list);
        setSourceBranch(list.find((branch) => branch.name === "main")?.name ?? list[0]?.name ?? "");
        setStatus("complete");
      } catch (e) {
        if (sequence !== repoCheckSequence.current) return;
        console.error(verifiedTemplate ? "Failed to fetch branches:" : "Failed to check template:", e);
        setRepoError(`${verifiedTemplate ? "Could not load repository branches" : "Could not verify repository template"}: ${e instanceof Error ? e.message : String(e)}`);
        setTemplateStatus(verifiedTemplate ? "ready" : "error");
        setStatus("error");
      }
    },
    []
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  // Load organizations once user authenticates
  useEffect(() => {
    if (!user) return;
    fetchOrgList()
      .then((data) => {
        setAccountList(data);
        // Don't clobber a pending URL restore with the default selection.
        if (!INITIAL_URL_PARAMS.has("account")) setSelectedAccount(data[0] ?? null);
      })
      .catch((error) => {
        console.error(error);
        setRepoError("Could not load GitHub accounts");
      })
      .finally(() => setAccountsLoaded(true));
  }, [user]);

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
    if (!selectedAccount) return;
    const key = String(selectedAccount.id);
    if (repoCache.current[key]) {
      setRepoList(repoCache.current[key]);
      setReposLoaded(true);
      return;
    }
    let cancelled = false;
    setRepoLoading(true);
    fetchRepos(selectedAccount)
      .then((list) => {
        repoCache.current[key] = list;
        if (!cancelled) setRepoList(list);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setRepoRefreshFailed(true);
          setRepoError("Could not load repositories");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReposLoaded(true);
          setRepoLoading(false);
        }
      });
    setTemplateName(null);
    return () => {
      cancelled = true;
    };
  }, [selectedAccount]);

  // Check selected repository
  useEffect(() => {
    checkSelectedRepo(selectedAccount, selectedRepo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepo?.id, selectedAccount?.id, checkSelectedRepo]);

  // ── Stable refs (for callbacks below that shouldn't re-create on every state change) ──
  const repoListRef = useRef(repoList);
  repoListRef.current = repoList;
  const selectedAccountRef = useRef(selectedAccount);
  selectedAccountRef.current = selectedAccount;
  const selectedRepoRef = useRef(selectedRepo);
  selectedRepoRef.current = selectedRepo;
  const sourceBranchRef = useRef(sourceBranch);
  sourceBranchRef.current = sourceBranch;

  // ── Actions ───────────────────────────────────────────────────────────────
  const onClone = useCallback(async () => {
    const acc = selectedAccountRef.current;
    const repo = selectedRepoRef.current;
    if (!acc || !repo) return;
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
      const { repo: newRepo, envSuccess, results } = await generateRepo(acc, name, isPrivate, includeAllBranch, createEnvs, TEMPLATE_REPO, VALID_ENVS);
      const updated = [...repoListRef.current, newRepo];
      setRepoList(updated);
      repoCache.current[String(acc.id)] = updated;
      setSelectedRepo({ id: newRepo.id, name: newRepo.name });
      if (!envSuccess) {
        const failed = results.envs.filter((e) => !e.success).map((e) => e.name);
        setCloneEnvWarning(`Repo created but failed to create environments: ${failed.join(", ")}`);
      }
    } catch {
      setCloneError("Clone failed");
    } finally {
      setCloning(false);
    }
  }, [isPrivate, includeAllBranch, createEnvs]);

  const onRefresh = useCallback(() => {
    const acc = selectedAccountRef.current;
    if (!acc && !user) return;
    setRepoLoading(true);
    setRepoRefreshFailed(false);
    setRepoError(null);
    setCloneEnvWarning(null);
    setStatus("loading");
    if (acc) delete repoCache.current[String(acc.id)];
    Promise.all([fetchOrgList(), acc ? fetchRepos(acc) : Promise.resolve([])])
      .then(async ([orgs, list]) => {
        if (selectedAccountRef.current?.id !== acc?.id) return;
        setAccountList(orgs);
        if (!acc) {
          setSelectedAccount(orgs[0] ?? null);
          return;
        }
        setRepoList(list);
        repoCache.current[String(acc.id)] = list;
        setRepoError(null);
        await checkSelectedRepo(acc, selectedRepoRef.current);
      })
      .catch((e) => {
        console.error(e);
        setRepoRefreshFailed(true);
        setRepoError("Could not refresh repositories");
      })
      .finally(() => setRepoLoading(false));
  }, [checkSelectedRepo, user]);

  const onCreateBranch = useCallback(async (targetName: string) => {
    const acc = selectedAccountRef.current;
    const repo = selectedRepoRef.current;
    if (!acc || !repo) return;
    setCreatingBranch(true);
    setCreateBranchError(null);
    const sequence = repoCheckSequence.current;
    try {
      let source = sourceBranchRef.current;
      if (!source) {
        const branches = await fetchBranches(acc, repo.name);
        if (sequence !== repoCheckSequence.current) return;
        setBranchList(branches);
        source = branches.find((branch) => branch.name === "main")?.name ?? branches[0]?.name ?? "";
        setSourceBranch(source);
        if (branches.some((branch) => branch.name === targetName)) return;
        if (!source) {
          console.error("No source branch is available after refreshing repository branches.");
          setCreateBranchError("No source branch is available yet. Please try again.");
          return;
        }
      }
      const newBranch = await createBranch(acc, repo.name, targetName, source);
      if (sequence !== repoCheckSequence.current) return;
      setBranchList((prev) => [...prev, newBranch]);
    } catch (error) {
      console.error("Failed to create branch:", error);
      if (sequence !== repoCheckSequence.current) return;
      setCreateBranchError("Failed to create branch");
    } finally {
      setCreatingBranch(false);
    }
  }, []);

  // ── Restore ───────────────────────────────────────────────────────────────
  const restoreAccount = useCallback(
    (value: string): boolean => {
      const match = findIgnoreCase(accountList, (a) => a.login, value);
      // Fall back to the default selection on a miss — leaving nothing selected strands the UI.
      setSelectedAccount(match ?? accountList[0] ?? null);
      return !!match;
    },
    [accountList]
  );

  const restoreRepo = useCallback(
    (value: string): boolean => {
      const match = findIgnoreCase(repoList, (r) => r.name, value);
      if (!match) return false;
      setSelectedRepo({ id: match.id, name: match.name });
      return true;
    },
    [repoList]
  );

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
    status,
    repoLoading,
    repoRefreshFailed,
    repoError,
    // Actions
    onClone,
    onRefresh,
    onCreateBranch,
    // Restore
    restore: {
      account: { ready: accountsLoaded, scope: user?.login ?? null, apply: restoreAccount },
      repo: { ready: reposLoaded, scope: selectedAccount?.id ?? null, apply: restoreRepo },
    },
  };
}
