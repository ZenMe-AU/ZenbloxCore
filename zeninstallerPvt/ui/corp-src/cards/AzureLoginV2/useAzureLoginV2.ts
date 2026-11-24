/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useReducer, useSyncExternalStore } from "react";
import type { AuthenticationResult } from "@azure/msal-browser";
import { cleanTenantId, getMsal, getToken, LOGIN_AUTHORITY, MSA_TENANT, PINNED_TENANT_ID } from "../../auth/msal";
import { listTenants } from "../../api/azureGraph";
import { ARM_SCOPES, AZURE_CLIENT_ID, LOGIN_SCOPES } from "../../config/azureConfig";
import type { AppContext, SharedCard } from "../../appContext";
import type { AzureAccount } from "../../types";
import {
  getBaseCardContext,
  initialState,
  reducer,
} from "./stateMachine";

const cardId = "azure_login_v2";

// Its own key, so a tenant consent redirect started here is not confirmed by the original Azure login card on the way back.
const SESSION_KEY = "zeninstaller_arm_tenant_v2";

type RedirectClient = { handleRedirectPromise: () => Promise<AuthenticationResult | null> };
const redirectInFlight = new WeakMap<object, Promise<AuthenticationResult | null>>();

function handleRedirectOnce(msal: RedirectClient): Promise<AuthenticationResult | null> {
  const existing = redirectInFlight.get(msal);
  if (existing) return existing;
  const pending = msal.handleRedirectPromise();
  redirectInFlight.set(msal, pending);
  void pending.finally(() => setTimeout(() => redirectInFlight.delete(msal), 0));
  return pending;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAzureLoginV2 {
  baseCardContext: ReturnType<typeof getBaseCardContext>;
  privateContext: {
    appContext: ReturnType<AppContext["getSnapshot"]>;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => void;
    setManualTenantId: (id: string) => void;
    selectTenant: (tenantId: string) => void;
  };
}

// Maps a raw MSAL/AADSTS failure to user-facing text — never surface the raw trace/correlation-id blob.
function friendlyTenantError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("AADSTS90072")) {
    return "This account isn't a member of that tenant — sign in with a different account, or have an admin add it as a guest first.";
  }
  return "Couldn't reach that tenant — check the tenant ID or your access, then try again.";
}

/*
 * Azure sign-in and tenant choice, built from AzureLogin's useAzureAccount + useAzureLoginCard but with no
 * state shared with them: downstream cards read the account and confirmed tenant from AppContext instead.
 * It leaves out the parts that belong to the original card's neighbours: the saved-tenant auto-apply from
 * the GitHub variables, the URL restore, the app-registration result's MSA tenant, and setActiveAzureIdentity.
 */
export function useAzureLoginV2(appStore: AppContext): UseAzureLoginV2 {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [state, dispatch] = useReducer(reducer, initialState);
  const { account, manualTenantId, confirmedTenantId } = state;

  // Fetch the tenant list via ARM (display names); fall back to the account's known tenant IDs for MSA.
  const loadTenants = useCallback(
    async (acc: AzureAccount) => {
      try {
        const list = await listTenants(acc);
        if (list.length > 0) {
          dispatch({ type: "tenants-loaded", accountId: acc.homeAccountId, tenants: list });
          return;
        }
      } catch {
        /* MSA / consent — fall through to the tenantProfiles fallback */
      }
      const ids = Array.from(acc.tenantProfiles?.keys() ?? []).filter((id) => id !== MSA_TENANT);
      dispatch({ type: "tenants-loaded", accountId: acc.homeAccountId, tenants: ids.map((id) => ({ tenantId: id, displayName: id })) });
    },
    []
  );

  // Load the tenant list once signed in; it counts as loaded only for the account it was loaded for.
  useEffect(() => {
    if (account) void loadTenants(account);
  }, [account, loadTenants]);

  // On mount: handle the redirect callback OR restore an existing session.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (!AZURE_CLIENT_ID) {
          dispatch({ type: "unconfigured" });
          return;
        }
        const msal = await getMsal();
        if (!msal || cancelled) {
          if (!cancelled) dispatch({ type: "session-empty" });
          return;
        }
        const result = await handleRedirectOnce(msal);
        if (cancelled) return;

        const savedTenant = cleanTenantId(sessionStorage.getItem(SESSION_KEY));

        // Probe for an ARM token so the pending-consent redirect fires here rather than
        // surfacing later as an unexplained failure in whichever card reads ARM first.
        const tryConfirmArm = async (acc: AzureAccount, tenant: string | undefined) => {
          try {
            await getToken(acc, ARM_SCOPES, tenant);
            if (tenant) sessionStorage.removeItem(SESSION_KEY);
            return tenant ?? null;
          } catch (err) {
            // ARM consent not yet granted — redirect for ARM
            const message = err instanceof Error ? err.message : "";
            if ((message.includes("AADSTS65001") || message.includes("interaction_required")) && tenant) {
              await msal.acquireTokenRedirect({
                scopes: ARM_SCOPES,
                authority: `https://login.microsoftonline.com/${tenant}`,
              });
            }
            return null;
          }
        };

        const accounts = result?.account ? [result.account] : msal.getAllAccounts();
        if (accounts.length === 0) {
          dispatch({ type: "session-empty" });
          return;
        }
        const acc = (savedTenant ? accounts.find((candidate) => candidate.tenantId === savedTenant) : undefined)
          ?? accounts.find((candidate) => candidate.tenantId !== MSA_TENANT) ?? accounts[0];
        // An MSA account pre-fills its first real tenant, without treating it as user confirmation.
        const msaTenant = acc.tenantId === MSA_TENANT
          ? Array.from(acc.tenantProfiles?.keys() ?? []).find((id) => id !== MSA_TENANT)
          : undefined;
        const prefill = savedTenant ?? msaTenant;
        const confirmedTenant = await tryConfirmArm(acc, savedTenant);
        if (!cancelled) dispatch({
          type: "session-restored",
          account: acc,
          prefilledTenantId: prefill ?? PINNED_TENANT_ID ?? "",
          confirmedTenantId: confirmedTenant ?? PINNED_TENANT_ID ?? null,
        });
      } catch (err) {
        console.error("MSAL init error:", err);
        if (!cancelled) dispatch({ type: "session-empty" });
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async () => {
    dispatch({ type: "login-requested" });
    try {
      const msal = await getMsal();
      if (!msal) {
        dispatch({ type: "login-failed", error: "Microsoft authentication is not configured" });
        return;
      }
      // Navigates away to Microsoft; the mount check above picks the session up on the way back.
      await msal.loginRedirect({
        scopes: LOGIN_SCOPES,
        authority: LOGIN_AUTHORITY,
        prompt: "select_account",
      });
    } catch (err) {
      console.error("loginRedirect failed:", err);
      dispatch({ type: "login-failed", error: err instanceof Error ? err.message : "Login failed" });
    }
  }, []);

  const confirmTenantId = useCallback(
    async (tenantIdArg?: string) => {
      if (!account) return;
      const tid = (tenantIdArg ?? manualTenantId).trim();
      if (!tid) {
        dispatch({ type: "tenant-confirmation-failed", error: "Please enter your Tenant ID" });
        return;
      }
      dispatch({ type: "tenant-confirmation-started", tenantId: tid });
      const msal = await getMsal();
      if (!msal) {
        dispatch({ type: "tenant-confirmation-failed", error: "Microsoft authentication is not configured" });
        return;
      }

      // Use tenant-specific account from cache if available (avoids re-consent on repeat visits)
      const tenantAccount = msal.getAllAccounts().find((candidate) => candidate.tenantId === tid) ?? account;

      try {
        // Silent ARM acquire first (listTenants/listSubscriptions are ARM-only) — may create a new AAD tenant account in MSAL cache
        await msal.acquireTokenSilent({
          scopes: ARM_SCOPES,
          account: tenantAccount,
          authority: `https://login.microsoftonline.com/${tid}`,
        });
        // Re-query cache and keep the best account for this tenant
        const bestAccount = msal.getAllAccounts().find((candidate) => candidate.tenantId === tid) ?? tenantAccount;
        dispatch({ type: "tenant-confirmed", tenantId: tid, account: bestAccount });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        const needsConsent = message.includes("AADSTS65001") || message.includes("interaction_required") || message.includes("MSA_NEEDS_TENANT");
        if (!needsConsent) {
          dispatch({ type: "tenant-confirmation-failed", error: friendlyTenantError(err) });
          return;
        }
      }

      // No cached token for this tenant → redirect for consent
      sessionStorage.setItem(SESSION_KEY, tid);
      try {
        await msal.loginRedirect({
          scopes: ARM_SCOPES,
          authority: `https://login.microsoftonline.com/${tid}`,
          prompt: "consent",
        });
        dispatch({ type: "tenant-consent-redirected" });
      } catch (err) {
        sessionStorage.removeItem(SESSION_KEY);
        dispatch({ type: "tenant-confirmation-failed", error: err instanceof Error ? err.message : "Failed to redirect" });
      }
    },
    [account, manualTenantId]
  );

  // Pick a tenant from the dropdown → point at it and confirm ARM access.
  const selectTenant = useCallback(
    (tid: string) => {
      if (!account?.tenantProfiles?.has(tid)) {
        (async () => {
          const msal = await getMsal();
          if (!msal) return;
          await msal.acquireTokenRedirect({
            account: account ?? undefined,
            scopes: ARM_SCOPES,
            authority: `https://login.microsoftonline.com/${tid}`,
          });
        })();
      }
      void confirmTenantId(tid);
    },
    [account, confirmTenantId]
  );

  // One MSAL client serves both Azure login cards, so this clears the original card's cached tokens too.
  const logout = useCallback(async () => {
    const msal = await getMsal();
    if (msal) await msal.clearCache().catch(() => {});
    dispatch({ type: "logout-completed" });
  }, []);

  // Reserved for manually refreshing the Azure session and tenant data.
  const refresh = useCallback(() => {}, []);

  // ── Projection ────────────────────────────────────────────────────────────
  const tenantId = PINNED_TENANT_ID ?? confirmedTenantId;
  const baseCardContext = getBaseCardContext(state, PINNED_TENANT_ID);
  const done = baseCardContext.done;
  useEffect(() => {
    appStore.update(cardId, {
      title: baseCardContext.title,
      currentBaseCardStatus: baseCardContext.lifecycle,
      currentStatus: state.lifecycle,
      azureAccount: account ? {
        homeAccountId: account.homeAccountId,
        environment: account.environment,
        tenantId: account.tenantId,
        localAccountId: account.localAccountId,
        username: account.username,
      } : null,
      azureTenantId: done ? tenantId : null,
    } satisfies SharedCard<typeof cardId>);
  }, [appStore, baseCardContext.title, baseCardContext.lifecycle, state.lifecycle, account, done, tenantId]);

  return {
    baseCardContext,
    privateContext: {
      appContext,
      login,
      logout,
      refresh,
      setManualTenantId: (tenantIdValue) => dispatch({ type: "manual-tenant-changed", tenantId: tenantIdValue }),
      selectTenant,
    },
  };
}
