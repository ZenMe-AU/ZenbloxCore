import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "../../access-pass-src/api/accessPassMsal";
import { GRAPH_SCOPES } from "../config/accessPassConfig";
import {
  listUsersManagedBySignedInUser,
  createTemporaryAccessPassForUser,
  generateRandomPassword,
  getSignedInUserObjectId,
  removeNonPasswordAuthenticationMethods,
  resetUserPassword,
  temporaryAccessPassMethodExists,
  MSA_TENANT,
  type EntraUser,
} from "../../access-pass-src/api/accessPassGraph";
import { bootstrapPassResetGroups } from "../../access-pass-src/api/accessPassBackend";
import type { Account, StageDefinition } from "../types";
import { logEvent } from "../monitor/telemetry";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";
export type SetupStep = { id: string; label: string; status: StepStatus; detail?: string };
export type AzureSetupResult = {
  accessPassValue: string;
  tenantId: string;
  targetUserId?: string;
  tapMethodId?: string;
};

const SESSION_KEY = "zeninstaller_arm_tenant_access";
const RESULT_KEY = "zeninstaller_azure_access_result";
const AZURE_SETUP_RESULT_KEY = "zeninstaller_azure_result";
const LOGIN_INTENT_KEY = "zeninstaller_access_pass_login_intent";

function saveResult(r: AzureSetupResult | null) {
  if (r) localStorage.setItem(RESULT_KEY, JSON.stringify(r));
  else localStorage.removeItem(RESULT_KEY);
}
function loadResult(): AzureSetupResult | null {
  try {
    return JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null");
  } catch {
    return null;
  }
}

// Load tenant ID from localStorage, if present. This is used to persist the tenant context across page reloads.
function loadTenantIdFromStorage(key: string): string | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { tenantId?: string } | null;
    const tenantId = parsed?.tenantId?.trim();
    return tenantId ? tenantId : undefined;
  } catch {
    return undefined;
  }
}

// Extract tenant ID from the homeAccountId claim, if present. This is used to infer the tenant context for personal accounts.
function extractTenantFromHomeAccountId(homeAccountId?: string): string | undefined {
  if (!homeAccountId) return undefined;
  const parts = homeAccountId.split(".");
  const candidate = parts.length > 1 ? parts[1] : undefined;
  if (!candidate || candidate === MSA_TENANT) return undefined;
  return candidate;
}

// Convert known error messages from the TAP creation API into user-friendly messages.
function toTapErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Failed";
  const lower = msg.toLowerCase();

  if (lower.includes("403") && (lower.includes("temporaryaccesspassmethods") || lower.includes("accessdenied"))) {
    return (
      "Not authorized to create Temporary Access Pass. " +
      "Ensure your signed-in account has Authentication Administrator or Privileged Authentication Administrator role, " +
      "the app has delegated UserAuthenticationMethod.ReadWrite.All with admin consent, and Temporary Access Pass is enabled in Entra Authentication methods policy."
    );
  }

  if (lower.includes("aadsts65001") || lower.includes("interaction_required") || lower.includes("consent_required")) {
    return "Graph admin consent is required for this tenant. Reconnect Azure and grant consent, then try again.";
  }

  if (lower.includes("404") && lower.includes("temporaryaccesspassmethods")) {
    return "Selected user was not found in the current tenant context. Re-select the user and try again.";
  }

  if (lower.includes("authentication/methods") && lower.includes("403")) {
    return (
      "Not authorized to remove existing sign-in methods. " +
      "Ensure your account has Authentication Administrator or Privileged Authentication Administrator role, " +
      "and delegated UserAuthenticationMethod.ReadWrite.All has admin consent."
    );
  }

  if (lower.includes("passwordprofile") && lower.includes("403")) {
    return (
      "Not authorized to reset the user password. " +
      "Ensure your account has permissions to reset user passwords and delegated User.ReadWrite.All has admin consent."
    );
  }

  if (lower.includes("/groups/") && lower.includes("members/$ref") && lower.includes("403")) {
    return (
      "Not authorized to update Pass Reset group membership. " +
      "Ensure your account can manage group members and delegated GroupMember.ReadWrite.All has admin consent."
    );
  }

  if (lower.includes("/api/access-pass/bootstrap-groups") && (lower.includes("401") || lower.includes("403"))) {
    return "Not authorized to run Access Pass backend bootstrap. Ensure the Function key is configured and backend app permissions are granted with admin consent.";
  }

  return msg;
}

export function useAzureAccessPass(props: {
  githubAccount: Account | null;
  githubRepo: string;
  validEnvs: readonly string[];
  stages?: StageDefinition[];
}) {
  const { validEnvs } = props;
  const [azureAccount, setAzureAccount] = useState<AccountInfo | null>(null);
  const [appName, setAppName] = useState("zeninstaller-github");
  const defaultSelected = ["PROD", "TEST"].filter((e) => validEnvs.includes(e));
  const [environments, setEnvironments] = useState<string[]>(
    defaultSelected.length > 0 ? defaultSelected : ["PROD", "TEST"],
  );
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [result, setResult] = useState<AzureSetupResult | null>(loadResult);
  const [running, setRunning] = useState(false);
  const [loggingIn, setLoggingIn] = useState(true);
  const [consentFailed, setConsentFailed] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [manualTenantId, setManualTenantId] = useState("");
  const [forceTenantSelection, setForceTenantSelection] = useState(false);
  const [tenantIdError, setTenantIdError] = useState<string | null>(null);
  // Manager-matched Entra users shown in the personal-account fallback flow.
  const [managerUsers, setManagerUsers] = useState<EntraUser[]>([]);
  const [selectedManagerUserId, setSelectedManagerUserId] = useState("");
  const [managerUsersLoading, setManagerUsersLoading] = useState(false);
  const [managerUsersError, setManagerUsersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function validatePersistedTap() {
      if (!azureAccount || !result) return;
      if (!result.targetUserId || !result.tapMethodId) {
        if (!cancelled) {
          setResult(null);
          saveResult(null);
        }
        return;
      }

      try {
        const msal = await getMsal();
        const tenant = result.tenantId || manualTenantId.trim() || azureAccount.tenantId;
        const tenantAccount = msal?.getAllAccounts().find((a) => a.tenantId === tenant) ?? azureAccount;
        const exists = await temporaryAccessPassMethodExists(
          tenantAccount,
          result.targetUserId,
          result.tapMethodId,
          tenant,
        );
        if (!exists && !cancelled) {
          setResult(null);
          saveResult(null);
        }
      } catch {
        // Conservative behavior: hide stale/unknown value if TAP cannot be validated.
        if (!cancelled) {
          setResult(null);
          saveResult(null);
        }
      }
    }

    validatePersistedTap().catch(() => {
      /* handled above */
    });

    return () => {
      cancelled = true;
    };
  }, [azureAccount, result, manualTenantId]);

  const availableTenants = useMemo(() => {
    if (!azureAccount?.tenantProfiles) return [];
    return Array.from(azureAccount.tenantProfiles.keys()).filter((id) => id !== MSA_TENANT);
  }, [azureAccount]);

  const isMsaAccount = azureAccount?.tenantId === MSA_TENANT;
  const normalizedTenantId = manualTenantId.trim();
  // Always carry the resolved tenant for MSA flows; do not tie this to UI gating state.
  const effectiveTenantId = isMsaAccount
    ? normalizedTenantId || loadResult()?.tenantId || loadTenantIdFromStorage(AZURE_SETUP_RESULT_KEY)
    : undefined;
  const needsTenantId = (isMsaAccount && !effectiveTenantId) || forceTenantSelection;

  const updateStep = useCallback((id: string, status: StepStatus, detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  // Load Entra users managed by the signed-in user, trying multiple plausible tenant contexts until one succeeds.
  const loadManagerUsers = useCallback(async (account: AccountInfo, tenantCandidates: string[]) => {
    // Populate dropdown with users managed by the signed-in user.
    setManagerUsersLoading(true);
    setManagerUsersError(null);
    try {
      const msal = await getMsal();
      const claimTid = (account.idTokenClaims as { tid?: string } | undefined)?.tid;
      const homeTid = extractTenantFromHomeAccountId(account.homeAccountId);
      const cachedTenantIds = (msal?.getAllAccounts() ?? [])
        .map((a) => a.tenantId)
        .filter((tid) => tid && tid !== MSA_TENANT);
      const savedTenantId = loadResult()?.tenantId;
      const setupTenantId = loadTenantIdFromStorage(AZURE_SETUP_RESULT_KEY);
      const sessionTenantId = sessionStorage.getItem(SESSION_KEY) || undefined;
      const candidates = Array.from(
        new Set(
          [
            ...tenantCandidates,
            ...(sessionTenantId ? [sessionTenantId] : []),
            ...(savedTenantId ? [savedTenantId] : []),
            ...(setupTenantId ? [setupTenantId] : []),
            ...(claimTid ? [claimTid] : []),
            ...(homeTid ? [homeTid] : []),
            ...cachedTenantIds,
          ]
            .map((t) => t.trim())
            .filter((t) => t && t !== MSA_TENANT),
        ),
      );
      if (candidates.length === 0) {
        setManagerUsers([]);
        setSelectedManagerUserId("");
        setManagerUsersError(
          "No tenant context found for loading Entra users. Complete Azure tenant sign-in once in Azure Setup, then retry.",
        );
        return;
      }

      let lastError: string | null = null;

      for (const tid of candidates) {
        try {
          const tenantAccount = msal?.getAllAccounts().find((a) => a.tenantId === tid) ?? account;
          const users = await listUsersManagedBySignedInUser(tenantAccount, tid);
          if (users.length > 0) {
            setManualTenantId(tid);
            setManagerUsers(users);
            setSelectedManagerUserId((prev) => {
              // Keep the previous selection when still valid; otherwise default to the first option.
              if (prev && users.some((u) => u.id === prev)) return prev;
              return users[0]?.id ?? "";
            });
            return;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to load Entra users";
          const lowerMsg = msg.toLowerCase();
          const needsConsent =
            lowerMsg.includes("aadsts65001") ||
            lowerMsg.includes("interaction_required") ||
            lowerMsg.includes("consent_required") ||
            lowerMsg.includes("login_required") ||
            lowerMsg.includes("no account") ||
            lowerMsg.includes("no tokens found");

          if (needsConsent) {
            try {
              if (msal) {
                await msal.loginRedirect({
                  scopes: GRAPH_SCOPES,
                  authority: `https://login.microsoftonline.com/${tid}`,
                  prompt: "consent",
                });
                return;
              }
            } catch (redirectErr) {
              const redirectMsg =
                redirectErr instanceof Error ? redirectErr.message : "Failed to redirect for Graph consent";
              setManagerUsers([]);
              setSelectedManagerUserId("");
              setManagerUsersError(redirectMsg);
              return;
            }
          }

          lastError = msg;
        }
      }

      setManagerUsers([]);
      setSelectedManagerUserId("");
      setManagerUsersError(lastError ?? "No Entra users found that are managed by your signed-in account.");
    } finally {
      setManagerUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!azureAccount) return;
    if (needsTenantId) {
      setManagerUsers([]);
      setSelectedManagerUserId("");
      return;
    }
    // Try all plausible tenant contexts and pick the one that returns direct reports.
    const tenantCandidates =
      azureAccount.tenantId === MSA_TENANT
        ? [manualTenantId, ...availableTenants]
        : [manualTenantId, azureAccount.tenantId, ...availableTenants];
    loadManagerUsers(azureAccount, tenantCandidates).catch(() => {
      /* handled by state */
    });
  }, [azureAccount, availableTenants, loadManagerUsers, manualTenantId, needsTenantId]);

  // On mount: handle redirect callback OR restore existing session
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const msal = await getMsal();
        if (!msal || cancelled) return;
        const result = await msal.handleRedirectPromise();
        if (cancelled) return;

        const savedTenant = sessionStorage.getItem(SESSION_KEY) || undefined;
        const setupTenant = loadTenantIdFromStorage(AZURE_SETUP_RESULT_KEY);

        const msaTenant = (acc: AccountInfo) =>
          acc.tenantId === MSA_TENANT ? (savedTenant ?? loadResult()?.tenantId ?? setupTenant ?? undefined) : undefined;

        if (result?.account) {
          console.log("MSAL accounts on init:", msal.getAllAccounts());
          setAzureAccount(result.account);
          if (sessionStorage.getItem(LOGIN_INTENT_KEY) === "1") {
            logEvent("accessPassLoginSucceeded", {
              username: result.account.username,
              tenantId: result.account.tenantId,
            });
            sessionStorage.removeItem(LOGIN_INTENT_KEY);
          }
          const tenant = msaTenant(result.account);
          if (tenant) setManualTenantId(tenant);
          if (tenant) sessionStorage.removeItem(SESSION_KEY);
        } else {
          const accounts = msal.getAllAccounts();
          console.log("MSAL accounts on init:", accounts);
          if (accounts.length > 0) {
            const preferredTid = savedTenant ?? loadResult()?.tenantId ?? setupTenant;
            const account =
              (preferredTid ? accounts.find((a) => a.tenantId === preferredTid) : undefined) ??
              accounts.find((a) => a.tenantId !== MSA_TENANT) ??
              accounts[0];
            setAzureAccount(account);
            if (sessionStorage.getItem(LOGIN_INTENT_KEY) === "1") {
              logEvent("accessPassLoginSucceeded", {
                username: account.username,
                tenantId: account.tenantId,
              });
              sessionStorage.removeItem(LOGIN_INTENT_KEY);
            }
            const tenant = msaTenant(account) ?? (account.tenantId === MSA_TENANT ? preferredTid : undefined);
            if (tenant) setManualTenantId(tenant);
            if (tenant) sessionStorage.removeItem(SESSION_KEY);
          }
        }
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

  const login = useCallback(
    async function btnLoginClicked() {
      logEvent("btnLoginClicked", { parentId: "XXXXXXX" });
      setLoginError(null);
      setSubsError(null);
      setTenantIdError(null);
      setForceTenantSelection(false);
      try {
        const msal = await getMsal();
        if (!msal) return;
        const preferredTenant = manualTenantId.trim();
        sessionStorage.setItem(LOGIN_INTENT_KEY, "1");
        await msal.loginRedirect({
          scopes: GRAPH_SCOPES,
          authority: preferredTenant
            ? `https://login.microsoftonline.com/${preferredTenant}`
            : "https://login.microsoftonline.com/common",
          prompt: "select_account",
        });
      } catch (err) {
        console.error("loginRedirect failed:", err);
        setLoginError(err instanceof Error ? err.message : "Login failed");
      }
    },
    [manualTenantId],
  );

  const confirmTenantId = useCallback(async () => {
    if (!azureAccount) return;
    const tid = manualTenantId.trim();
    if (!tid) {
      setTenantIdError("Please enter your Tenant ID");
      return;
    }
    setTenantIdError(null);
    setSubsError(null);

    const msal = await getMsal();
    if (!msal) return;

    // Use tenant-specific account from cache if available (avoids re-consent on repeat visits)
    const accounts = msal.getAllAccounts();
    const tenantAccount = accounts.find((a) => a.tenantId === tid) ?? azureAccount;

    try {
      // Silent GRAPH acquire first — may create a new AAD tenant account in MSAL cache
      await msal.acquireTokenSilent({
        scopes: GRAPH_SCOPES,
        account: tenantAccount,
        authority: `https://login.microsoftonline.com/${tid}`,
      });
      // Re-query cache and pick best account before loading subs
      const refreshed = msal.getAllAccounts();
      const bestAccount = refreshed.find((a) => a.tenantId === tid) ?? tenantAccount;
      if (bestAccount !== azureAccount) setAzureAccount(bestAccount);
      await loadManagerUsers(bestAccount, [tid]);
      setForceTenantSelection(false);
      sessionStorage.removeItem(SESSION_KEY);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const needsConsent =
        msg.includes("AADSTS65001") || msg.includes("interaction_required") || msg.includes("MSA_NEEDS_TENANT");
      if (!needsConsent) {
        setSubsError(msg || "Failed to validate tenant");
        return;
      }
    }

    // No cached token for this tenant → redirect for consent
    sessionStorage.setItem(SESSION_KEY, tid);
    try {
      await msal.loginRedirect({
        scopes: GRAPH_SCOPES,
        authority: `https://login.microsoftonline.com/${tid}`,
        prompt: "consent",
      });
    } catch (err) {
      sessionStorage.removeItem(SESSION_KEY);
      setTenantIdError(err instanceof Error ? err.message : "Failed to redirect");
    }
  }, [azureAccount, manualTenantId, loadManagerUsers]);

  const changeTenant = useCallback(() => {
    setSubsError(null);
    setTenantIdError(null);
    setManagerUsers([]);
    setSelectedManagerUserId("");
    setManagerUsersError(null);
    setManualTenantId("");
    setForceTenantSelection(true);
  }, []);

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    saveResult(null);
    setConsentFailed(false);
  }, []);

  const clearSession = useCallback(async () => {
    const msal = await getMsal();
    if (msal) await msal.clearCache().catch(() => {});
    setAzureAccount(null);
    setResult(null);
    saveResult(null);
    setSteps([]);
    setConsentFailed(false);
    setSubsError(null);
    setManualTenantId("");
    setForceTenantSelection(false);
    setTenantIdError(null);
    setManagerUsers([]);
    setSelectedManagerUserId("");
    setManagerUsersError(null);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const runForUser = useCallback(
    async (targetUserId: string): Promise<AzureSetupResult | null> => {
      if (!azureAccount || !targetUserId) return null;
      setSelectedManagerUserId(targetUserId);
      setRunning(true);
      setConsentFailed(false);
      const msal = await getMsal();
      const tenantScopedAccount =
        (effectiveTenantId ? msal?.getAllAccounts().find((a) => a.tenantId === effectiveTenantId) : undefined) ??
        azureAccount;
      const resolvedTenantId = effectiveTenantId ?? tenantScopedAccount.tenantId;

      const initialSteps: SetupStep[] = [
        { id: "addManagerToResetManagers", label: "Add manager user to Pass Reset Managers", status: "pending" },
        { id: "addTargetToResetTargets", label: "Add target user to Pass Reset Targets AU", status: "pending" },
        { id: "removeMethods", label: "Remove Existing Login Methods", status: "pending" },
        { id: "rotatePassword", label: "Randomize User Password", status: "pending" },
        { id: "tap", label: "Create Temporary Access Pass", status: "pending" },
      ];
      setSteps(initialSteps);

      let currentStepId: SetupStep["id"] = "addManagerToResetManagers";
      try {
        updateStep("addManagerToResetManagers", "running");
        const managerUserId = await getSignedInUserObjectId(tenantScopedAccount, effectiveTenantId);
        await bootstrapPassResetGroups({
          tenantId: resolvedTenantId,
          managerUserId,
          targetUserId,
        });
        logEvent("accessPassManagerAddedToResetManagersGroup", {
          managerUserId,
        });
        updateStep("addManagerToResetManagers", "done", "Manager user added to Pass Reset Managers");

        currentStepId = "addTargetToResetTargets";
        updateStep("addTargetToResetTargets", "running");
        logEvent("accessPassTargetUserAddedToResetTargetsAU", {
          targetUserId,
        });
        updateStep("addTargetToResetTargets", "done", "Target user added to Pass Reset Targets AU");

        currentStepId = "removeMethods";
        updateStep("removeMethods", "running");
        const removedMethods = await removeNonPasswordAuthenticationMethods(
          tenantScopedAccount,
          targetUserId,
          effectiveTenantId,
        );
        logEvent("accessPassAuthenticationMethodsDeleted", {
          targetUserId,
          removedMethods,
        });
        updateStep(
          "removeMethods",
          "done",
          removedMethods > 0
            ? `Removed ${removedMethods} existing method${removedMethods === 1 ? "" : "s"}`
            : "No removable methods found",
        );

        currentStepId = "rotatePassword";
        updateStep("rotatePassword", "running");
        const randomizedPassword = generateRandomPassword(30);
        await resetUserPassword(tenantScopedAccount, targetUserId, randomizedPassword, effectiveTenantId);
        logEvent("accessPassPasswordReset", {
          targetUserId,
        });
        updateStep("rotatePassword", "done", "Password randomized to a new 30-character value");

        currentStepId = "tap";
        updateStep("tap", "running");
        const tap = await createTemporaryAccessPassForUser(tenantScopedAccount, targetUserId, effectiveTenantId);
        logEvent("accessPassTemporaryAccessPassCreated", {
          targetUserId,
          tapMethodId: tap.id,
        });
        updateStep("tap", "done", "Temporary Access Pass created");

        const r = {
          accessPassValue: tap.temporaryAccessPass,
          tenantId: resolvedTenantId,
          targetUserId,
          tapMethodId: tap.id,
        };
        setResult(r);
        saveResult(r);
        return r;
      } catch (err) {
        logEvent("accessPassWorkflowStepFailed", {
          targetUserId,
          stepId: currentStepId,
          message: err instanceof Error ? err.message : String(err),
        });
        updateStep(currentStepId, "error", toTapErrorMessage(err));
        return null;
      } finally {
        setRunning(false);
      }
    },
    [azureAccount, effectiveTenantId, updateStep],
  );

  const run = useCallback(async () => {
    if (!selectedManagerUserId) return;
    await runForUser(selectedManagerUserId);
  }, [runForUser, selectedManagerUserId]);

  return {
    azureAccount,
    appName,
    setAppName,
    environments,
    setEnvironments,
    steps,
    result,
    running,
    loggingIn,
    consentFailed,
    loginError,
    subsError,
    needsTenantId,
    managerUsers,
    selectedManagerUserId,
    setSelectedManagerUserId,
    managerUsersLoading,
    managerUsersError,
    availableTenants,
    manualTenantId,
    setManualTenantId,
    tenantIdError,
    confirmTenantId,
    login,
    logout,
    reset,
    runForUser,
    run,
    changeTenant,
  };
}
