/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
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
import { checkPrerequisites, type BaseCardContext } from "../../components/useBaseCard";
import { APP_SCOPES } from "../../config/azureConfig";
import { useGithubVariablesV2, type GithubTarget, type UseGithubVariablesV2 } from "../../hooks/useGithubVariablesV2";
import { formatCardResourceAccessError, useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { isConsentError } from "../../logic/consent";
import { getEnvSettingsUrl } from "../../logic/github";
import { getFederatedCredential, getImmutableRepoSegment } from "../../logic/naming";
import type { CardHook, CardId, CardStatus, SetupStep } from "../../types";
import { azureAppRegistrationAccess } from "../AzureAppRegistration/config";
import { useRbacCheck, type RbacCheckStatus } from "../AzureAppRegistration/useRbacCheck";
import {
  deriveLifecycle,
  getPrerequisites,
  githubLoginCardId,
  initialCardContext,
  initialState,
  reducer,
  stateGraph,
  toBaseCardLifecycle,
  type Lifecycle,
} from "./stateMachine";

// ─── Types ────────────────────────────────────────────────────────────────────

// What only this card knows: the app it makes, the run that makes it, and where its client id is saved.
export type PrivateContext = {
  blockedBy: { cardId: CardId; label: string }[]; // The prerequisites still to finish, while blocked, labelled "Title (card_id)" from AppContext.
  appName: string;
  setAppName: (name: string) => void;
  steps: SetupStep[];
  running: boolean;
  run: () => Promise<void>;
  reset: () => void;
  spClientId: string; // The app the card checks: the one GitHub holds, else the one the last run made.
  rbacStatus: RbacCheckStatus;
  rbacMissingRoles: string[];
  rbacError: string | null;
  planClientIdMismatch: boolean; // AZURE_PLAN_CLIENT_ID has drifted from AZURE_CLIENT_ID (a run always keeps them equal).
  managementAccess: CardResourceAccess;

  // Where the client id is saved; null until the prerequisites are complete.
  github: GithubTarget | null;
  variables: UseGithubVariablesV2;
  populate: Record<string, string> | undefined;
  autoSaveCounter: number; // Goes up after each successful run, which saves the new client id to GitHub.
  differsFromGithub: boolean; // The last run's app isn't what GitHub holds, whatever the draft says.
};

export interface UseCard extends CardHook {
  readonly cardId: "azure_app_registration_v2";
  shared: SharedCard<"azure_app_registration_v2">;
  baseCardContext: BaseCardContext<Lifecycle>;
  privateContext: PrivateContext;
}

const DEFAULT_APP_NAME = "zeninstaller-github";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export default function useCard(appStore: AppContext): UseCard {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [state, dispatchLifecycle] = useReducer(reducer, initialState);
  const prerequisiteContext = { ...initialCardContext, lifecycle: toBaseCardLifecycle(state.lifecycle) };
  const prerequisites = getPrerequisites(appContext, prerequisiteContext);
  const missing = checkPrerequisites(appContext, prerequisiteContext);
  // A prerequisite can be complete before what it shares reaches AppContext; Azure login 2 is still the way on.
  const blockedBy = (missing.length > 0 ? missing : initialCardContext.prerequisiteIds.slice(0, 1)).map((id) => {
    const prerequisite = appContext.cards[id as CardId];
    return { cardId: id as CardId, label: prerequisite?.initialised ? `${prerequisite.title} (${id})` : id };
  });
  const account = prerequisites?.account ?? null;
  const tenantId = prerequisites?.tenantId;
  const subscription = prerequisites?.subscription ?? null;
  const subscriptionId = subscription?.id ?? "";
  const githubRepository = prerequisites?.githubRepository ?? null;
  const environmentName = githubRepository?.environment.name ?? "";
  const githubRepoId = typeof githubRepository?.repository.id === "number" ? githubRepository.repository.id : null;

  const github: GithubTarget | null = githubRepository && {
    account: githubRepository.account,
    repoName: githubRepository.repository.name,
    envName: environmentName,
    envUrl: getEnvSettingsUrl(`${githubRepository.account.login}/${githubRepository.repository.name}`, githubRepository.environment.id),
  };
  // GitHub is called from the browser whichever way GitHub login 2 got its token; the backend only exchanges it.
  // From AppContext rather than prerequisites: React Compiler won't keep a memo keyed on a field of prerequisites (react-hooks/preserve-manual-memoization).
  const githubLogin = appContext.cards[githubLoginCardId];
  const githubToken = prerequisites && githubLogin?.initialised ? githubLogin.githubToken : null;
  const githubApi = useMemo(() => githubToken ? createGithubApi(githubToken.reveal()) : null, [githubToken]);
  const variables = useGithubVariablesV2({ target: github, api: githubApi });
  const savedClientId = variables.values.AZURE_CLIENT_ID ?? "";
  const savedPlanClientId = variables.values.AZURE_PLAN_CLIENT_ID ?? "";

  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const [result, setResult] = useState<{ key: string; clientId: string } | null>(null);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const [namedFor, setNamedFor] = useState<string | null>(null);

  // A run's result counts only for what it was made for: a federated credential is per environment, the role per subscription.
  const runKey = JSON.stringify([tenantId, subscriptionId, githubRepository?.account.id, githubRepository?.repository.id, environmentName]);
  const ran = result?.key === runKey ? result : null;
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
  useEffect(() => {
    if (!account || !nameKey || namedFor === nameKey) return;
    let cancelled = false;
    getAppNameByAppId(account, savedClientId, tenantId)
      .then((name) => {
        if (!cancelled && name) setAppName(name);
      })
      .catch(() => {
        /* keep the name as it is */
      })
      .finally(() => {
        if (!cancelled) setNamedFor(nameKey);
      });
    return () => {
      cancelled = true;
    };
  }, [account, nameKey, namedFor, savedClientId, tenantId]);
  const prefillingAppName = !!nameKey && namedFor !== nameKey;

  const reset = () => {
    resetSteps();
    setResult(null);
  };

  // Redirects for Application/AppRoleAssignment.ReadWrite.All incremental consent; the user re-runs after returning.
  const requestAppConsent = async () => {
    if (!account) return;
    const msal = await getMsal();
    if (!msal) return;
    await msal.acquireTokenRedirect({
      scopes: APP_SCOPES,
      account,
      authority: `https://login.microsoftonline.com/${tenantId || account.tenantId}`,
    });
  };

  const run = async () => {
    if (!account || !subscription || !githubRepository || !githubApi) return;
    setRunning(true);

    const key = runKey;
    const githubAccount = githubRepository.account;
    const repoName = githubRepository.repository.name;
    const org = githubAccount.login;

    const initialSteps: SetupStep[] = [
      { id: "access", label: "Check subscription access to assign RBAC roles", status: "pending" },
      { id: "consent", label: "Confirm Microsoft permissions", status: "pending" },
      { id: "graph-access", label: "Check Microsoft Graph service-principal access", status: "pending" },
      { id: "app", label: "Create app registration", status: "pending" },
      { id: "sp", label: "Create service principal", status: "pending" },
      { id: "oidc", label: "Link Azure sign-in to this GitHub repository", status: "pending" },
      { id: "creds", label: "Add federated credentials", status: "pending" },
      { id: "rbac", label: "Assign RBAC roles", status: "pending" },
    ];
    setSteps(initialSteps);

    let appId = "";
    let appObjectId = "";
    let spObjectId = "";
    let currentStep = "access";

    try {
      updateStep("access", "running");
      await checkResourceAccess();
      updateStep("access", "done");

      currentStep = "consent";
      updateStep("consent", "running");
      const promptedGraph = await ensureScopeConsent(account, [...APP_SCOPES], tenantId);
      updateStep("consent", promptedGraph ? "done" : "skipped", promptedGraph ? undefined : "Already granted");

      currentStep = "graph-access";
      updateStep("graph-access", "running");
      try {
        await ensureServicePrincipalAccess(account, tenantId);
      } catch (error) {
        reportAccessFailure(error);
        throw new Error(formatCardResourceAccessError(error), { cause: error });
      }
      updateStep("graph-access", "done", "Read-only service-principal access verified; Graph enforces create permission during the operation.");

      currentStep = "app";
      updateStep("app", "running");
      const existing = await getExistingApp(account, appName, tenantId);
      if (existing) {
        appId = existing.appId;
        appObjectId = existing.id;
        updateStep("app", "skipped", `Existing: ${appId}`);
      } else {
        // No pipeline-wide app permissions requested up front — cards that need one (e.g. domain) grant it themselves.
        const created = await createAppRegistration(account, appName, [], tenantId);
        appId = created.appId;
        appObjectId = created.id;
        updateStep("app", "done", appId);
      }

      currentStep = "sp";
      updateStep("sp", "running");
      const existingSP = await getExistingSP(account, appId, tenantId);
      if (existingSP) {
        spObjectId = existingSP.id;
        updateStep("sp", "skipped", "Already exists");
      } else {
        const servicePrincipal = await createServicePrincipal(account, appId, tenantId);
        spObjectId = servicePrincipal.id;
        updateStep("sp", "done", spObjectId);
      }

      currentStep = "oidc";
      updateStep("oidc", "running");
      if (githubRepoId === null) throw new Error(`Create the repository ${repoName} on GitHub before running this`);
      await githubApi.setOidcImmutableSubject(githubAccount, repoName);
      updateStep("oidc", "done", getImmutableRepoSegment(org, githubAccount.id, repoName, githubRepoId));

      currentStep = "creds";
      updateStep("creds", "running");
      const credential = getFederatedCredential(org, githubAccount.id, repoName, githubRepoId, environmentName);
      const added = await ensureFederatedCredential(account, appObjectId, credential.name, credential.subject, tenantId);
      updateStep("creds", added ? "done" : "skipped", added ? `${environmentName} added` : `${environmentName} already exists`);

      currentStep = "rbac";
      updateStep("rbac", "running");
      await ensureRbacRole(account, subscription.id, spObjectId, "Reader", tenantId);
      updateStep("rbac", "done", subscription.displayName || subscription.id);

      setResult({ key, clientId: appId });
      setAutoSaveCounter((count) => count + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      const stepMessage = (currentStep === "sp" || currentStep === "graph-access") && (/\b403\b|Authorization_RequestDenied|Insufficient privileges/i.test(message))
        ? formatCardResourceAccessError(err)
        : message;
      if (currentStep === "sp" && stepMessage !== message) reportAccessFailure(err);
      if (currentStep === "rbac" && /^403\b/.test(message)) reportAccessFailure(err);
      if (isConsentError(message)) {
        updateStep(currentStep, "error", "Additional consent required — redirecting to Microsoft...");
        await requestAppConsent().catch(() => updateStep(currentStep, "error", "Consent redirect failed — try again"));
      } else {
        updateStep(currentStep, "error", stepMessage);
      }
    } finally {
      setRunning(false);
    }
  };

  const failedStep = steps.find((step) => step.status === "error");
  const activity = managementAccess.status === "checking" ? "Checking Azure resource access"
    : liveRbac.checking && !rbacTrusted ? "Checking app registration access"
    : prefillingAppName ? "Fetching app registration name"
    : variables.loading ? "Loading GitHub variables" : null;
  const differsFromGithub = !!ran && (savedClientId !== ran.clientId || savedPlanClientId !== ran.clientId);
  const verified = !!savedClientId && savedPlanClientId === savedClientId && rbacStatus === "ready" && managementAccess.status === "ready";
  const lifecycle = deriveLifecycle({
    prerequisitesMet: !!prerequisites,
    running,
    checking: !!activity,
    failed: !!failedStep || managementAccess.status === "error" || !!rbacError,
    unsaved: differsFromGithub,
    verified,
  });
  if (lifecycle !== state.lifecycle) {
    dispatchLifecycle({ type: "transition", lifecycle });
  }
  const done = lifecycle === "complete";
  const populate = ran ? { AZURE_CLIENT_ID: ran.clientId, AZURE_PLAN_CLIENT_ID: ran.clientId } : undefined;
  const status: CardStatus = done ? "complete"
    : lifecycle === "error" ? "error"
    : lifecycle === "loading" || lifecycle === "running" ? "loading"
    : lifecycle === "blocked" ? "idle" : "warning";
  const summary = ({
    blocked: blockedBy[0].label,
    loading: activity ?? "Checking app registration",
    running: steps.find((step) => step.status === "running")?.label ?? "Creating app registration",
    error: failedStep ? `Failed: ${failedStep.label}`
      : managementAccess.status === "error" ? "Insufficient permissions to continue"
      : "Could not verify app registration access",
    unsaved: "Save app registration connection details",
    ready: rbacStatus === "sp-not-found" ? "Not found in the selected tenant — recreate it"
      : rbacStatus === "missing-role" ? "Missing access on the selected subscription"
      : planClientIdMismatch ? "AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID"
      : managementAccess.status === "warning" ? "Missing Azure permissions to continue"
      : savedClientId ? "Re-run app registration" : "Create app registration",
    complete: "App registration ready",
  } satisfies Record<Lifecycle, string>)[lifecycle];

  const baseCardContext = {
    ...initialCardContext,
    summary,
    lifecycle: toBaseCardLifecycle(lifecycle),
    stateMachine: { graph: stateGraph, currentState: lifecycle },
  } satisfies BaseCardContext<Lifecycle>;

  return {
    cardId: "azure_app_registration_v2" as const,
    shared: {
      title: baseCardContext.title,
      status: baseCardContext.lifecycle,
      azureClientId: done ? savedClientId : null,
    } satisfies SharedCard<"azure_app_registration_v2">,
    status,
    done,
    baseCardContext,
    privateContext: {
      blockedBy,
      appName,
      setAppName,
      steps,
      running,
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
      github,
      variables,
      populate,
      autoSaveCounter,
      differsFromGithub,
    },
  };
}
