/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useReducer, useRef, useSyncExternalStore, type Dispatch } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppContext } from "../../appContext";
import {
  createTemporaryAccessPassForUser, deleteUserAuthenticationMethod, ensureTemporaryAccessPassEnabled,
  listUserAuthenticationMethods, listUsersManagedBySignedInUser, resetUserPassword, temporaryAccessPassMethodExists,
} from "../../api/azureGraph";
import { getMsal } from "../../auth/msal";
import { checkPrerequisites } from "../../components/useBaseCard";
import { ACCESS_PASS_SCOPES } from "../../config/azureConfig";
import { getAuthMethodDeletePath, toTapErrorMessage, type AccessPassResult } from "../../logic/accessPass";
import { isConsentError } from "../../logic/consent";
import { generateRandomPassword } from "../../logic/password";
import { createResultStorage } from "../../logic/resultStorage";
import {
  canTransition, cardId, createInitialState, getBaseCardContext, initialState, isRunning, PAGE_SIZE, reducer,
  type Event, type StepId, type StoredResults,
} from "./stateMachine";

export const STORAGE_KEY = "zeninstaller_corp_access_pass_v2";
const storage = createResultStorage<StoredResults>(STORAGE_KEY);

function getIdentity(snapshot: ReturnType<AppContext["getSnapshot"]>) {
  const login = snapshot.cards.azure_login_v2;
  if (!login?.initialised || login.currentBaseCardStatus !== "complete" || !login.azureAccount || !login.azureTenantId) return null;
  return {
    account: login.azureAccount,
    tenantId: login.azureTenantId,
    key: JSON.stringify([login.azureAccount.homeAccountId, login.azureAccount.environment, login.azureTenantId]),
  };
}

export interface UseAccessPassV2 {
  baseCardContext: ReturnType<typeof getBaseCardContext>;
  privateContext: typeof initialState.privateContext & {
    appContext: ReturnType<AppContext["getSnapshot"]>;
    dispatch: Dispatch<Event>;
    managerUsers: Awaited<ReturnType<typeof listUsersManagedBySignedInUser>>;
    managerUsersLoading: boolean;
    managerUsersError: string | null;
    running: boolean;
    canCreate: boolean;
    canConfirmUser: boolean;
    totalPages: number;
    visiblePages: number[];
    confirmUser: (userId: string) => void;
    createPass: () => Promise<void>;
    requestAccessPassConsent: () => Promise<void>;
    refresh: () => void;
    goToPage: () => void;
  };
}

export function useAccessPassV2(appStore: AppContext): UseAccessPassV2 {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const identity = getIdentity(appContext);
  const identityKey = identity?.key ?? null;
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(identityKey, storage.load()));
  const baseCardContext = getBaseCardContext(state);
  const unmet = checkPrerequisites(appContext, baseCardContext);
  if (!identity && !unmet.includes("azure_login_v2")) unmet.push("azure_login_v2");
  if (identityKey !== state.privateContext.identityKey
    || unmet.length !== state.baseCardContext.unmetCardPrerequisites.length
    || unmet.some((id, index) => id !== state.baseCardContext.unmetCardPrerequisites[index])) {
    dispatch({ type: "sync-prerequisites", identityKey, unmet, saved: storage.load() });
  }
  const readyIdentity = identity && unmet.length === 0 && state.privateContext.identityKey === identityKey ? identity : null;

  const usersQuery = useQuery({
    queryKey: [cardId, "managed-users", identityKey],
    enabled: !!readyIdentity,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!readyIdentity) throw new Error("Sign in with Azure login 2 before loading managed users");
      const users = await listUsersManagedBySignedInUser(readyIdentity.account, readyIdentity.tenantId);
      signal.throwIfAborted();
      return users;
    },
  });
  const managerUsers = readyIdentity ? usersQuery.data ?? [] : [];
  const managerUsersError = readyIdentity && usersQuery.error ? toTapErrorMessage(usersQuery.error, "users") : null;
  const validationQuery = useQuery({
    queryKey: [cardId, "validate-passes", identityKey],
    enabled: !!readyIdentity && state.privateContext.validationPending,
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!readyIdentity) throw new Error("Sign in with Azure login 2 before checking saved passes");
      const passes = state.privateContext.passes;
      const checked = await Promise.all(Object.entries(passes).map(async ([userId, pass]) => {
        if (pass.tenantId !== readyIdentity.tenantId || pass.targetUserId !== userId) throw new Error("A saved pass does not match the selected tenant and user");
        const exists = await temporaryAccessPassMethodExists(readyIdentity.account, userId, pass.tapMethodId, readyIdentity.tenantId);
        return { userId, pass, exists };
      }));
      signal.throwIfAborted();
      return Object.fromEntries(checked.filter((item) => item.exists).map((item) => [item.userId, item.pass]));
    },
  });
  if (readyIdentity && state.privateContext.validationPending) {
    if (validationQuery.isSuccess && !validationQuery.isFetching) dispatch({ type: "validated", passes: validationQuery.data });
    else if (validationQuery.isError && !validationQuery.isFetching) {
      dispatch({
        type: "validation-failed",
        error: `Couldn't validate saved access passes: ${toTapErrorMessage(validationQuery.error, "tap")}`,
        consentRequired: isConsentError(validationQuery.error.message),
      });
    }
  }
  if (readyIdentity && state.lifecycle === "loading" && !state.privateContext.validationPending && !usersQuery.isPending && !usersQuery.isFetching) {
    dispatch({ type: "checked", error: managerUsersError, consentRequired: !!usersQuery.error && isConsentError(usersQuery.error.message) });
  }

  const totalPages = Math.max(1, Math.ceil(managerUsers.length / PAGE_SIZE));
  if (state.privateContext.currentPage > totalPages) dispatch({ type: "page", page: totalPages, totalPages });
  const startPage = Math.max(1, Math.min(state.privateContext.currentPage - 2, totalPages - 4));
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => startPage + index);
  const runRef = useRef<{ identityKey: string } | null>(null);
  useEffect(() => () => { runRef.current = null; }, []);

  useEffect(() => {
    if (!identityKey || state.privateContext.identityKey !== identityKey || state.privateContext.validationPending) return;
    storage.save({
      identityKey, passes: state.privateContext.passes,
      deliveryConfirmed: state.privateContext.deliveryConfirmed, completed: state.privateContext.completed,
    });
  }, [identityKey, state.privateContext.identityKey, state.privateContext.validationPending,
    state.privateContext.passes, state.privateContext.deliveryConfirmed, state.privateContext.completed]);
  useEffect(() => {
    appStore.update(cardId, {
      title: baseCardContext.title, currentBaseCardStatus: baseCardContext.lifecycle,
      currentStatus: state.lifecycle,
    });
  }, [appStore, baseCardContext.title, baseCardContext.lifecycle, state.lifecycle]);

  const reportUiError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("accessPassV2CommandFailed", message);
    dispatch({ type: "ui-error", error: message });
  };
  const confirmUser = (userId: string) => {
    if (!canTransition(state, "confirming") || managerUsersError || usersQuery.isFetching || !managerUsers.some((user) => user.id === userId)) {
      reportUiError(new Error("Complete Azure login 2 and select a managed user before creating an access pass"));
      return;
    }
    dispatch({ type: "confirm-user", userId });
  };
  const createPass = async () => {
    if (runRef.current || !readyIdentity || managerUsersError || usersQuery.isFetching || !canTransition(state, "policy")
      || !managerUsers.some((user) => user.id === state.privateContext.selectedUserId)) {
      reportUiError(new Error("Verify the selected managed user's photo ID before creating an access pass"));
      return;
    }
    const run = { identityKey: readyIdentity.key };
    runRef.current = run;
    const { account, tenantId } = readyIdentity;
    const userId = state.privateContext.selectedUserId;
    const assertCurrent = () => {
      if (runRef.current !== run || getIdentity(appStore.getSnapshot())?.key !== run.identityKey) {
        throw new Error("Access pass creation stopped because the Azure session changed. Sign-in methods may already have been removed.");
      }
    };
    dispatch({ type: "start" });
    let stepId: StepId = "policy";
    try {
      assertCurrent();
      const justEnabled = await ensureTemporaryAccessPassEnabled(account, tenantId);
      assertCurrent();
      dispatch({ type: "step-finished", stepId, status: justEnabled ? "done" : "skipped", detail: justEnabled ? "Enabled Temporary Access Pass for this tenant" : "Already enabled" });

      stepId = "removeMethods";
      const methods = await listUserAuthenticationMethods(account, userId, tenantId);
      assertCurrent();
      const paths = methods.map((method) => getAuthMethodDeletePath(userId, method)).filter((path): path is string => !!path);
      for (const path of paths) {
        assertCurrent();
        await deleteUserAuthenticationMethod(account, path, tenantId);
      }
      assertCurrent();
      dispatch({ type: "step-finished", stepId, status: "done",
        detail: paths.length ? `Removed ${paths.length} existing method${paths.length === 1 ? "" : "s"}` : "No removable methods found" });

      stepId = "rotatePassword";
      await resetUserPassword(account, userId, generateRandomPassword(30), tenantId);
      assertCurrent();
      dispatch({ type: "step-finished", stepId, status: "done", detail: "Password randomized to a new 30-character value" });

      stepId = "tap";
      const pass = await createTemporaryAccessPassForUser(account, userId, tenantId);
      assertCurrent();
      const result: AccessPassResult = { accessPassValue: pass.temporaryAccessPass, tenantId, targetUserId: userId, tapMethodId: pass.id };
      dispatch({ type: "pass-created", result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("accessPassV2WorkflowStepFailed", { stepId, message });
      if (runRef.current === run && getIdentity(appStore.getSnapshot())?.key === run.identityKey) {
        const consentRequired = isConsentError(message);
        dispatch({ type: "run-failed", consentRequired, error: consentRequired
          ? 'Additional consent required. Click "Grant consent", then try again.' : toTapErrorMessage(error, stepId) });
      }
    } finally {
      if (runRef.current === run) runRef.current = null;
    }
  };
  const requestAccessPassConsent = async () => {
    try {
      if (!readyIdentity) throw new Error("Sign in with Azure login 2 before granting consent");
      const msal = await getMsal();
      if (!msal) throw new Error("Microsoft sign-in is not configured");
      await msal.acquireTokenRedirect({
        scopes: ACCESS_PASS_SCOPES, account: readyIdentity.account,
        authority: `https://login.microsoftonline.com/${readyIdentity.tenantId}`,
      });
    } catch (error) { reportUiError(error); }
  };
  const goToPage = () => {
    const page = Number(state.privateContext.pageInput);
    if (!Number.isInteger(page) || page < 1) reportUiError(new Error("Enter a valid page number"));
    else dispatch({ type: "page", page, totalPages });
  };
  return {
    baseCardContext,
    privateContext: {
      ...state.privateContext, appContext, dispatch, managerUsers,
      managerUsersLoading: !!readyIdentity && usersQuery.isPending, managerUsersError,
      running: isRunning(state.lifecycle), canCreate: canTransition(state, "policy") && managerUsers.length > 0 && !managerUsersError && !usersQuery.isFetching,
      canConfirmUser: canTransition(state, "confirming") && managerUsers.length > 0 && !managerUsersError && !usersQuery.isFetching,
      totalPages, visiblePages, confirmUser, createPass, requestAccessPassConsent, goToPage,
      refresh: () => {
        if (!readyIdentity) { reportUiError(new Error("Sign in with Azure login 2 before refreshing users")); return; }
        dispatch({ type: "sync-prerequisites", identityKey, unmet, saved: null });
        void usersQuery.refetch();
      },
    },
  };
}
