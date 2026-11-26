/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createAppRegistration,
  createServicePrincipal,
  ensureFederatedCredential,
  ensureRbacRole,
  ensureServicePrincipalAccess,
  getAppNameByAppId,
  getExistingApp,
  getExistingSP,
} from "../../api/azureGraph";
import { createGithubApi } from "../../api/github";
import type { AppContext, SharedCard } from "../../appContext";
import { ensureScopeConsent, getMsal } from "../../auth/msal";
import { useCardAppContext, type BaseCardContext } from "../../components/useBaseCard";
import { APP_SCOPES } from "../../config/azureConfig";
import { useGithubVariablesV2, type UseGithubVariablesV2 } from "../../hooks/useGithubVariablesV2";
import { formatCardResourceAccessError, useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import { isConsentError } from "../../logic/consent";
import { getFederatedCredential, getImmutableRepoSegment } from "../../logic/naming";
import type { SetupStep } from "../../types";
import { azureAppRegistrationAccess } from "./config";
import { useRbacCheck, type RbacCheckStatus } from "./useRbacCheck";
import {
  azureLoginCardId,
  cardId,
  getBaseCardContext,
  githubLoginCardId,
  initialCardContext,
  initialState,
  reducer,
  repoCardId,
  subscriptionCardId,
  canLifecycleTransition,
  type Lifecycle,
} from "./stateMachine";

// ─── Types ────────────────────────────────────────────────────────────────────

// What only this card knows: the app it makes, the run that makes it, and where its client id is saved.
export type PrivateContext = {
  appContext: ReturnType<AppContext["getSnapshot"]>;
  appName: string;
  setAppName: (name: string) => void;
  steps: SetupStep[];
  running: boolean;
  runAllowed: boolean; // The lifecycle allows a run; run() checks the same.
  run: () => Promise<void>;
  reset: () => void;
  spClientId: string; // The app the card checks: the one GitHub holds, else the one the last run made.
  rbacStatus: RbacCheckStatus;
  rbacMissingRoles: string[];
  rbacError: string | null;
  planClientIdMismatch: boolean; // AZURE_PLAN_CLIENT_ID has drifted from AZURE_CLIENT_ID (a run always keeps them equal).
  managementAccess: CardResourceAccess;

  // This card's saved client ids in GitHub; where they live is Repository & environment 2's githubRepository.
  variables: UseGithubVariablesV2;
  runClientId: string | null; // The app the last run made for this scope, to put in the Saved to GitHub draft.
  autoSaveCounter: number; // Goes up after each successful run, which saves the new client id to GitHub.
};

export interface UseAzureAppRegistrationV2 {
  baseCardContext: BaseCardContext<Lifecycle>;
  privateContext: PrivateContext;
}

const DEFAULT_APP_NAME = "zeninstaller-github";

export type AppRegistrationDiscovery = {
  appName: string;
  application: { appId: string; id: string } | null;
  servicePrincipal: { id: string } | null;
};

// ─── Run ──────────────────────────────────────────────────────────────────────

export const runSteps: readonly SetupStep[] = [
  { id: "access", label: "Check subscription access to assign RBAC roles", status: "pending" },
  { id: "consent", label: "Confirm Microsoft permissions", status: "pending" },
  { id: "graph-access", label: "Check Microsoft Graph service-principal access", status: "pending" },
  { id: "app", label: "Create app registration", status: "pending" },
  { id: "sp", label: "Create service principal", status: "pending" },
  { id: "oidc", label: "Link Azure sign-in to this GitHub repository", status: "pending" },
  { id: "creds", label: "Add federated credentials", status: "pending" },
  { id: "rbac", label: "Assign RBAC roles", status: "pending" },
];

export type RunAppRegistrationInput = {
  account: NonNullable<SharedCard<typeof azureLoginCardId>["azureAccount"]>;
  tenantId: string;
  subscription: NonNullable<SharedCard<typeof subscriptionCardId>["azureSubscription"]>;
  githubRepository: NonNullable<SharedCard<typeof repoCardId>["githubRepository"]>;
  githubRepoId: number;
  appName: string; // Trimmed.
  githubApi: ReturnType<typeof createGithubApi>;
  discovery: AppRegistrationDiscovery | undefined; // Lets the run skip lookups discovery already made for this name.
  checkResourceAccess: CardResourceAccess["check"];
  reportAccessFailure: CardResourceAccess["reportFailure"];
  updateStep: (stepId: string, status: SetupStep["status"], detail?: string, progress?: number) => void;
  signal: AbortSignal;
};

export function isAbort(signal: AbortSignal, error: unknown): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

// Redirects for Application/AppRoleAssignment.ReadWrite.All incremental consent; the user re-runs after returning.
async function requestAppConsent(account: RunAppRegistrationInput["account"], tenantId: string) {
  const msal = await getMsal();
  if (!msal) return;
  await msal.acquireTokenRedirect({
    scopes: APP_SCOPES,
    account,
    authority: `https://login.microsoftonline.com/${tenantId || account.tenantId}`,
  });
}

// Makes (or reuses) the app, its service principal, the GitHub OIDC link, the federated credential and the Reader role.
// Returns the app's client id. A failed step is marked on its row and rethrown with the message to show; an abort is rethrown as is.
export async function runAppRegistration(input: RunAppRegistrationInput): Promise<string> {
  const { account, tenantId, subscription, githubRepository, githubRepoId, appName, githubApi, discovery, signal, updateStep } = input;
  const githubAccount = githubRepository.account;
  const repoName = githubRepository.repository.name;
  const environmentName = githubRepository.environment.name;
  const org = githubAccount.login;

  let appId = "";
  let appObjectId = "";
  let spObjectId = "";
  let currentStep = "access";

  try {
    signal.throwIfAborted();
    updateStep("access", "running");
    await input.checkResourceAccess();
    signal.throwIfAborted();
    updateStep("access", "done");

    currentStep = "consent";
    updateStep("consent", "running");
    const promptedGraph = await ensureScopeConsent(account, [...APP_SCOPES], tenantId);
    signal.throwIfAborted();
    updateStep("consent", promptedGraph ? "done" : "skipped", promptedGraph ? undefined : "Already granted");

    currentStep = "graph-access";
    updateStep("graph-access", "running");
    try {
      await ensureServicePrincipalAccess(account, tenantId);
      signal.throwIfAborted();
    } catch (error) {
      input.reportAccessFailure(error);
      throw new Error(formatCardResourceAccessError(error), { cause: error });
    }
    updateStep("graph-access", "done", "Read-only service-principal access verified; Graph enforces create permission during the operation.");

    currentStep = "app";
    updateStep("app", "running");
    const existing = discovery?.appName === appName
      ? discovery.application
      : await getExistingApp(account, appName, tenantId, signal);
    if (existing) {
      appId = existing.appId;
      appObjectId = existing.id;
      updateStep("app", "skipped", `Existing: ${appId}`);
    } else {
      // No pipeline-wide app permissions requested up front — cards that need one (e.g. domain) grant it themselves.
      const created = await createAppRegistration(account, appName, [], tenantId);
      signal.throwIfAborted();
      appId = created.appId;
      appObjectId = created.id;
      updateStep("app", "done", appId);
    }

    currentStep = "sp";
    updateStep("sp", "running");
    const existingSP = discovery?.application?.appId === appId
      ? discovery.servicePrincipal
      : await getExistingSP(account, appId, tenantId, signal);
    if (existingSP) {
      spObjectId = existingSP.id;
      updateStep("sp", "skipped", "Already exists");
    } else {
      const servicePrincipal = await createServicePrincipal(account, appId, tenantId);
      signal.throwIfAborted();
      spObjectId = servicePrincipal.id;
      updateStep("sp", "done", spObjectId);
    }

    currentStep = "oidc";
    updateStep("oidc", "running");
    await githubApi.setOidcImmutableSubject(githubAccount, repoName);
    signal.throwIfAborted();
    updateStep("oidc", "done", getImmutableRepoSegment(org, githubAccount.id, repoName, githubRepoId));

    currentStep = "creds";
    updateStep("creds", "running");
    const credential = getFederatedCredential(org, githubAccount.id, repoName, githubRepoId, environmentName);
    const added = await ensureFederatedCredential(account, appObjectId, credential.name, credential.subject, tenantId);
    signal.throwIfAborted();
    updateStep("creds", added ? "done" : "skipped", added ? `${environmentName} added` : `${environmentName} already exists`);

    currentStep = "rbac";
    updateStep("rbac", "running");
    await ensureRbacRole(account, subscription.id, spObjectId, "Reader", tenantId);
    signal.throwIfAborted();
    updateStep("rbac", "done", subscription.displayName || subscription.id);

    return appId;
  } catch (err) {
    if (isAbort(signal, err)) throw err;
    const message = err instanceof Error ? err.message : "Failed";
    const stepMessage = (currentStep === "sp" || currentStep === "graph-access") && (/\b403\b|Authorization_RequestDenied|Insufficient privileges/i.test(message))
      ? formatCardResourceAccessError(err)
      : message;
    if (currentStep === "sp" && stepMessage !== message) input.reportAccessFailure(err);
    if (currentStep === "rbac" && /^403\b/.test(message)) input.reportAccessFailure(err);
    if (isConsentError(message)) {
      updateStep(currentStep, "error", "Additional consent required — redirecting to Microsoft...");
      await requestAppConsent(account, tenantId).catch(() => updateStep(currentStep, "error", "Consent redirect failed — try again"));
    } else {
      updateStep(currentStep, "error", stepMessage);
    }
    throw new Error(stepMessage, { cause: err });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAzureAppRegistrationV2(appStore: AppContext): UseAzureAppRegistrationV2 {
  const { appContext, prerequisites, unmet, blockedSummary } = useCardAppContext(appStore, initialCardContext);
  const [state, dispatchLifecycle] = useReducer(reducer, initialState);
  const account = prerequisites?.[azureLoginCardId].azureAccount ?? null;
  const tenantId = prerequisites?.[azureLoginCardId].azureTenantId ?? null;
  const subscription = prerequisites?.[subscriptionCardId].azureSubscription ?? null;
  const subscriptionId = subscription?.id ?? "";
  const githubRepository = prerequisites?.[repoCardId].githubRepository ?? null;
  const environmentName = githubRepository?.environment.name ?? "";
  const githubRepoId = typeof githubRepository?.repository.id === "number" ? githubRepository.repository.id : null;
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);

  // GitHub is called from the browser whichever way GitHub login 2 got its token; the backend only exchanges it.
  // From AppContext rather than prerequisites: React Compiler won't keep a memo keyed on a field of prerequisites (react-hooks/preserve-manual-memoization).
  const githubLogin = appContext.cards[githubLoginCardId];
  const githubToken = prerequisites && githubLogin?.initialised ? githubLogin.githubToken : null;
  // What the app registration is made for; null until all of it has been shared.
  const target = account && tenantId && subscription && githubRepository && githubToken
    ? { account, tenantId, subscription, githubRepository }
    : null;
  const githubApi = useMemo(() => githubToken ? createGithubApi(githubToken.reveal()) : null, [githubToken]);
  const variables = useGithubVariablesV2({ target: githubRepository, api: githubApi });
  const savedClientId = variables.values.AZURE_CLIENT_ID ?? "";
  const savedPlanClientId = variables.values.AZURE_PLAN_CLIENT_ID ?? "";
  const [namedFor, setNamedFor] = useState<string | null>(null);
  // The name isn't part of the scope: typing it must not reset a run or put the card back to loading.
  const scopeKey = target && githubRepoId !== null
    ? JSON.stringify([account?.homeAccountId, tenantId, subscriptionId, githubRepository?.account.id, githubRepository?.repository.id, environmentName])
    : null;
  const trimmedAppName = appName.trim();
  // Look the typed name up once typing pauses, not on every keystroke.
  const [lookupName, setLookupName] = useState(trimmedAppName);
  useEffect(() => {
    const timer = setTimeout(() => setLookupName(trimmedAppName), 500);
    return () => clearTimeout(timer);
  }, [trimmedAppName]);
  const runControllerRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef(0);
  useEffect(() => {
    runControllerRef.current?.abort();
    runControllerRef.current = null;
    dispatchLifecycle({ type: "scope-changed", scopeKey });
    return () => runControllerRef.current?.abort();
  }, [scopeKey]);

  const discoveryQuery = useQuery({
    queryKey: ["azure_app_registration_v2", "discovery", scopeKey, savedClientId, lookupName],
    enabled: !!scopeKey && !!account && !!lookupName,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: "always",
    // A new name keeps showing the last lookup for this scope, so the card doesn't drop to loading (and unmount the
    // name field) while it refetches. The run only reuses a lookup made for its own name.
    placeholderData: (previous: AppRegistrationDiscovery | undefined, previousQuery) =>
      previousQuery?.queryKey[2] === scopeKey && previousQuery?.queryKey[3] === savedClientId ? previous : undefined,
    queryFn: async ({ signal }): Promise<AppRegistrationDiscovery> => {
      const savedAppName = savedClientId
        ? await getAppNameByAppId(account!, savedClientId, tenantId, signal)
        : null;
      const effectiveAppName = savedAppName ?? lookupName;
      const application = await getExistingApp(account!, effectiveAppName, tenantId, signal);
      const servicePrincipal = application
        ? await getExistingSP(account!, application.appId, tenantId, signal)
        : null;
      return { appName: effectiveAppName, application, servicePrincipal };
    },
  });

  // A run's result counts only for the complete scope it was made for.
  const ran = state.result?.scopeKey === scopeKey ? state.result : null;
  const spClientId = savedClientId || ran?.clientId || "";
  const planClientIdMismatch = !!savedClientId && !!savedPlanClientId && savedClientId !== savedPlanClientId;

  const managementAccess = useCardResourceAccess({ azureAccount: account, subscriptionId, tenantId }, azureAppRegistrationAccess());
  const { check: checkResourceAccess, reportFailure: reportAccessFailure } = managementAccess;

  // Live check: is the app in this tenant, and does its service principal hold Reader on the subscription?
  const liveRbac = useRbacCheck({ azureAccount: account, spClientId, subscriptionId, tenantId });
  // The run just granted the role; Azure can take a while to show it, so the run is trusted over the live check.
  const rbacTrusted = !!ran && ran.clientId === spClientId;
  const rbacStatus = rbacTrusted ? "ready" : liveRbac.status;
  const rbacMissingRoles = rbacTrusted ? [] : liveRbac.missingRoles;
  const rbacError = rbacTrusted ? null : liveRbac.error ?? null;

  // Name the field after the app GitHub holds, once per saved client id, so a re-run finds that app.
  const nameKey = account && savedClientId ? `${tenantId ?? ""}|${savedClientId}` : null;
  if (nameKey && namedFor !== nameKey && discoveryQuery.data) {
    setNamedFor(nameKey);
    if (discoveryQuery.data.appName) setAppName(discoveryQuery.data.appName);
  }
  const prefillingAppName = !!nameKey && namedFor !== nameKey && discoveryQuery.isPending;

  const reset = () => {
    runControllerRef.current?.abort();
    runControllerRef.current = null;
    dispatchLifecycle({ type: "reset" });
  };

  const run = async () => {
    if (!runAllowed || !scopeKey || !target || !githubApi || githubRepoId === null || !trimmedAppName) return;
    runControllerRef.current?.abort();
    const controller = new AbortController();
    runControllerRef.current = controller;
    const runId = ++runSequenceRef.current;
    dispatchLifecycle({ type: "run-started", scopeKey, runId, steps: [...runSteps] });
    try {
      const clientId = await runAppRegistration({
        ...target,
        githubRepoId,
        appName: trimmedAppName,
        githubApi,
        discovery: discoveryQuery.data,
        checkResourceAccess,
        reportAccessFailure,
        updateStep: (stepId, status, detail, progress) => {
          dispatchLifecycle({ type: "step-updated", scopeKey, runId, stepId, status, detail, progress });
        },
        signal: controller.signal,
      });
      dispatchLifecycle({ type: "run-completed", scopeKey, runId, clientId });
      void discoveryQuery.refetch();
    } catch (err) {
      if (isAbort(controller.signal, err)) dispatchLifecycle({ type: "run-cancelled", scopeKey, runId });
      else dispatchLifecycle({ type: "run-failed", scopeKey, runId });
    } finally {
      if (runControllerRef.current === controller) runControllerRef.current = null;
    }
  };

  const steps = state.steps;
  const running = state.activeRunId !== null;
  const activity = managementAccess.status === "checking" ? "Checking Azure resource access"
    : liveRbac.checking && !rbacTrusted ? "Checking app registration access"
    : prefillingAppName ? "Fetching app registration name"
    : discoveryQuery.isPending && !!scopeKey && !!lookupName ? "Checking app registration"
    : variables.loading ? "Loading GitHub variables" : null;
  const differsFromGithub = !!ran && (savedClientId !== ran.clientId || savedPlanClientId !== ran.clientId);
  const verified = !!savedClientId && savedPlanClientId === savedClientId && rbacStatus === "ready" && managementAccess.status === "ready";
  const baseCardContext = getBaseCardContext(state, {
    unmetCardPrerequisites: unmet,
    blockedSummary,
    prerequisitesMet: !!target,
    checkingMessage: activity,
    managementAccessStatus: managementAccess.status,
    discoveryError: discoveryQuery.error instanceof Error ? discoveryQuery.error.message : null,
    rbacStatus,
    rbacError,
    differsFromGithub,
    verified,
    planClientIdMismatch,
    hasSavedClientId: !!savedClientId,
  });
  const lifecycle = baseCardContext.stateMachine!.currentState;
  // The graph documents the derived moves; flag one it doesn't list so the diagram gets fixed, not the card blocked.
  const previousLifecycleRef = useRef(lifecycle);
  useEffect(() => {
    const previous = previousLifecycleRef.current;
    previousLifecycleRef.current = lifecycle;
    if (import.meta.env.DEV && previous !== lifecycle && !canLifecycleTransition(previous, lifecycle)) {
      console.warn(`azure_app_registration_v2: ${previous} → ${lifecycle} is not in stateGraph`);
    }
  }, [lifecycle]);
  const runAllowed = canLifecycleTransition(lifecycle, "running");
  const done = lifecycle === "complete";

  useEffect(() => {
    appStore.update(cardId, {
      title: baseCardContext.title,
      prerequisiteIds: baseCardContext.prerequisiteIds,
      currentBaseCardStatus: baseCardContext.lifecycle,
      currentStatus: lifecycle,
      azureClientId: done ? savedClientId : null,
    } satisfies SharedCard<typeof cardId>);
  }, [appStore, baseCardContext.title, baseCardContext.prerequisiteIds, baseCardContext.lifecycle, lifecycle, done, savedClientId]);

  return {
    baseCardContext,
    privateContext: {
      appContext,
      appName,
      setAppName,
      steps,
      running,
      runAllowed,
      run,
      reset,
      spClientId,
      rbacStatus,
      rbacMissingRoles,
      rbacError,
      planClientIdMismatch,
      managementAccess: {
        ...managementAccess,
        retry: () => {
          managementAccess.retry();
          // Rechecks Graph reads only; Graph remains authoritative for app/service-principal writes.
          if (account && subscriptionId) void ensureServicePrincipalAccess(account, tenantId).catch(reportAccessFailure);
        },
      },
      variables,
      runClientId: ran?.clientId ?? null,
      autoSaveCounter: state.autoSaveCounter,
    },
  };
}
