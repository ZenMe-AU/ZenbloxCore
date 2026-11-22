/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import { cleanTenantId, getMsal, getToken, LOGIN_AUTHORITY, MSA_TENANT, PINNED_TENANT_ID } from "../../auth/msal";
import { listTenants } from "../../api/azureGraph";
import { ARM_SCOPES, AZURE_CLIENT_ID, LOGIN_SCOPES } from "../../config/azureConfig";
import { tenantDisplayName } from "../../logic/tenant";
import type { SharedCard } from "../../appContext";
import type { BaseCardContext } from "../../components/basecardlifecycle";
import type { AzureAccount, AzureTenant, CardHook, CardStatus, LoginHook } from "../../types";
import {
  deriveLifecycle,
  initialState,
  reducer,
  stateGraph,
  toBaseCardLifecycle,
  type Lifecycle as AzureLoginV2Lifecycle,
} from "./stateMachine";

// Its own key, so a tenant consent redirect started here is not confirmed by the original Azure login card on the way back.
const SESSION_KEY = "zeninstaller_arm_tenant_v2";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAzureLoginCardV2 extends CardHook, LoginHook<AzureAccount> {
  readonly cardId: "azure_login_v2";
  summary: string;
  cardDependencyLabel: string;
  baseCardContext: BaseCardContext<AzureLoginV2Lifecycle>;
  machineLifecycle: AzureLoginV2Lifecycle;
  shared: SharedCard;

  login: () => Promise<void>;
  logout: () => Promise<void>;
  loginError: string | null;
  redirecting: boolean;
  tenants: AzureTenant[];
  tenantsLoaded: boolean;
  tenantPinned: boolean; // VITE_AZURE_TENANT_ID is set, so the tenant is not the user's to choose.
  manualTenantId: string;
  setManualTenantId: (id: string) => void;
  // The tenant ARM access was confirmed for; manualTenantId is the raw field and changes on every keystroke.
  confirmedTenantId: string | null;
  confirming: boolean;
  tenantIdError: string | null;
  selectTenant: (tenantId: string) => void;
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
export function useAzureLoginCardV2(): UseAzureLoginCardV2 {
  const [account, setAccount] = useState<AzureAccount | null>(null);
  const [tenants, setTenants] = useState<AzureTenant[]>([]);
  const [loggingIn, setLoggingIn] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [manualTenantId, setManualTenantId] = useState("");
  const [confirmedTenantId, setConfirmedTenantId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tenantIdError, setTenantIdError] = useState<string | null>(null);
  const [tenantsLoadedFor, setTenantsLoadedFor] = useState<AzureAccount | null>(null);
  const [state, dispatchLifecycle] = useReducer(reducer, initialState);

  const applyTenantList = useCallback((list: AzureTenant[]) => {
    setTenants(list);
    setManualTenantId((current) => {
      if (!current) return current;
      const match = list.find((tenant) => tenant.tenantId.toLowerCase() === current.toLowerCase())
        ?? list.find((tenant) => tenant.displayName.toLowerCase() === current.toLowerCase());
      return match ? match.tenantId : current;
    });
  }, []);

  // Fetch the tenant list via ARM (display names); fall back to the account's known tenant IDs for MSA.
  const loadTenants = useCallback(
    async (acc: AzureAccount) => {
      try {
        try {
          const list = await listTenants(acc);
          if (list.length > 0) {
            applyTenantList(list);
            return;
          }
        } catch {
          /* MSA / consent — fall through to the tenantProfiles fallback */
        }
        if (acc.tenantProfiles) {
          const ids = Array.from(acc.tenantProfiles.keys()).filter((id) => id !== MSA_TENANT);
          applyTenantList(ids.map((id) => ({ tenantId: id, displayName: id })));
        }
      } finally {
        setTenantsLoadedFor(acc);
      }
    },
    [applyTenantList]
  );

  // Load the tenant list once signed in; it counts as loaded only for the account it was loaded for.
  useEffect(() => {
    if (account) void loadTenants(account);
  }, [account, loadTenants]);
  const tenantsLoaded = !!account && tenantsLoadedFor === account;

  // On mount: handle the redirect callback OR restore an existing session.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const msal = await getMsal();
        if (!msal || cancelled) return;
        // MSAL hands every caller the same redirect result, so the original Azure login card sees it too.
        const result = await msal.handleRedirectPromise();
        if (cancelled) return;

        const savedTenant = cleanTenantId(sessionStorage.getItem(SESSION_KEY));

        // Probe for an ARM token so the pending-consent redirect fires here rather than
        // surfacing later as an unexplained failure in whichever card reads ARM first.
        const tryConfirmArm = async (acc: AzureAccount, tenant: string | undefined) => {
          try {
            await getToken(acc, ARM_SCOPES, tenant);
            if (tenant) sessionStorage.removeItem(SESSION_KEY);
            // A late startup probe must not replace a tenant the user has since confirmed.
            if (!cancelled) setConfirmedTenantId((current) => current ?? (tenant ?? ""));
          } catch (err) {
            // ARM consent not yet granted — redirect for ARM
            const message = err instanceof Error ? err.message : "";
            if ((message.includes("AADSTS65001") || message.includes("interaction_required")) && tenant) {
              await msal.acquireTokenRedirect({
                scopes: ARM_SCOPES,
                authority: `https://login.microsoftonline.com/${tenant}`,
              });
            }
          }
        };

        const accounts = result?.account ? [result.account] : msal.getAllAccounts();
        if (accounts.length === 0) return;
        const acc = (savedTenant ? accounts.find((candidate) => candidate.tenantId === savedTenant) : undefined)
          ?? accounts.find((candidate) => candidate.tenantId !== MSA_TENANT) ?? accounts[0];
        setAccount(acc);
        // An MSA account pre-fills its first real tenant, without treating it as user confirmation.
        const msaTenant = acc.tenantId === MSA_TENANT
          ? Array.from(acc.tenantProfiles?.keys() ?? []).find((id) => id !== MSA_TENANT)
          : undefined;
        const prefill = savedTenant ?? msaTenant;
        if (prefill) setManualTenantId(prefill);
        await tryConfirmArm(acc, savedTenant);
      } catch (err) {
        console.error("MSAL init error:", err);
      } finally {
        if (!cancelled) setLoggingIn(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async () => {
    setLoginError(null);
    setRedirecting(true);
    try {
      const msal = await getMsal();
      if (!msal) return;
      // Navigates away to Microsoft; the mount check above picks the session up on the way back.
      await msal.loginRedirect({
        scopes: LOGIN_SCOPES,
        authority: LOGIN_AUTHORITY,
        prompt: "select_account",
      });
    } catch (err) {
      console.error("loginRedirect failed:", err);
      setLoginError(err instanceof Error ? err.message : "Login failed");
      setRedirecting(false);
    }
  }, []);

  const confirmTenantId = useCallback(
    async (tenantIdArg?: string) => {
      if (!account) return;
      const tid = (tenantIdArg ?? manualTenantId).trim();
      if (!tid) {
        setTenantIdError("Please enter your Tenant ID");
        return;
      }
      setTenantIdError(null);
      setConfirming(true);
      try {
        const msal = await getMsal();
        if (!msal) return;

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
          if (bestAccount !== account) setAccount(bestAccount);
          setManualTenantId(tid);
          setConfirmedTenantId(tid);
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          const needsConsent = message.includes("AADSTS65001") || message.includes("interaction_required") || message.includes("MSA_NEEDS_TENANT");
          if (!needsConsent) {
            setTenantIdError(friendlyTenantError(err));
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
        } catch (err) {
          sessionStorage.removeItem(SESSION_KEY);
          setTenantIdError(err instanceof Error ? err.message : "Failed to redirect");
        }
      } finally {
        setConfirming(false);
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
      setManualTenantId(tid);
      setTenantIdError(null);
      void confirmTenantId(tid);
    },
    [account, confirmTenantId]
  );

  // One MSAL client serves both Azure login cards, so this clears the original card's cached tokens too.
  const logout = useCallback(async () => {
    const msal = await getMsal();
    if (msal) await msal.clearCache().catch(() => {});
    setAccount(null);
    setTenants([]);
    setManualTenantId("");
    setConfirmedTenantId(null);
    setTenantIdError(null);
  }, []);

  // ── Projection ────────────────────────────────────────────────────────────
  const tenantId = PINNED_TENANT_ID ?? confirmedTenantId;
  const lifecycle = deriveLifecycle({
    configured: !!AZURE_CLIENT_ID, loggingIn, redirecting, account, confirming, loginError, tenantIdError, tenantId,
  });
  if (lifecycle !== state.lifecycle) {
    dispatchLifecycle({ type: "transition", lifecycle });
  }
  const done = lifecycle === "tenant-confirmed";
  const status: CardStatus = lifecycle === "unconfigured" ? "unavailable" : done ? "complete" : account ? "warning" : "idle";
  const summary = ({
    loading: "Checking session...",
    unconfigured: "Unavailable",
    "signed-out": "Sign in to Azure",
    "signing-in": "Connecting...",
    "selecting-tenant": "Select a tenant",
    "confirming-tenant": "Confirming tenant...",
    "tenant-confirmed": [account?.username, tenantDisplayName(tenants, tenantId)].filter(Boolean).join(" · ") || "Signed in",
    error: loginError ?? tenantIdError ?? "Error",
  } satisfies Record<AzureLoginV2Lifecycle, string>)[lifecycle];

  const baseCardContext = {
    cardId: "azure_login_v2",
    title: "Azure login 2",
    prerequisiteIds: [],
    summary,
    lifecycle: toBaseCardLifecycle(lifecycle),
    stateMachine: { graph: stateGraph, currentState: lifecycle },
  } satisfies BaseCardContext<AzureLoginV2Lifecycle>;

  return {
    // cardHook
    cardId: "azure_login_v2" as const,
    status,
    summary,
    cardRequirements: [],
    cardDependencyLabel: account ? "Select a tenant" : "Sign in to Azure",
    done,
    // loginHook
    account,
    loggingIn,
    login,
    logout,
    refresh: () => {},
    // extra
    baseCardContext,
    machineLifecycle: lifecycle,
    shared: {
      title: baseCardContext.title,
      status: baseCardContext.lifecycle,
      azureAccount: account,
      azureTenantId: done ? tenantId : null,
    },
    loginError,
    redirecting,
    tenants,
    tenantsLoaded,
    tenantPinned: !!PINNED_TENANT_ID,
    manualTenantId: PINNED_TENANT_ID ?? manualTenantId,
    setManualTenantId,
    confirmedTenantId: tenantId,
    confirming,
    tenantIdError,
    selectTenant,
  };
}
