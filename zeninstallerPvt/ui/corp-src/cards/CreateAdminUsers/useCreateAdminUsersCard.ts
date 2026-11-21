/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useReducer, useState } from "react";
// import { getMsal } from "../../auth/msal"; // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
import { AZURE_CLIENT_ID } from "../../config/azureConfig";
import { searchUsers, type AdminPair, type EntraUser, type VerifiedDomain } from "../../api/azureGraph";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { isConsentError } from "../../logic/consent";
import type { AzureAccount, CardHook, CardStatus, SetupStep } from "../../types";
import {
  ADMIN_GROUPS,
  // ADMIN_USERS_SCOPES, // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
  createAdminUsersAccess,
  CREATE_ADMIN_USERS_TITLE,
  PIM_OPTION,
  licenceAllows,
  type LicenceState,
  type RoleTarget,
} from "./config";
import { adminRowErrors, adminRowWarnings, duplicateUpns, errorText, newAdmin, rowUpns, waitingReducer, withoutCreated, type AdminRow, type WaitingAdmin } from "./logic";
import { adminUsersSteps, runAdminUsers } from "./steps";
import { useAdminDirectory, useLicenceAndDomains, useTakenUpns } from "./useEntraReads";

// The card's hook only connects its parts: logic.ts (rows and checks), useEntraReads.ts (reads), steps.ts (the run).

// After a run, Entra is read again this long after it; an admin it still doesn't list after the last read is unlisted.
const RECHECK_DELAYS_MS = [3000, 10000, 30000];

export type UseCreateAdminUsersCardParams = {
  azureAccount: AzureAccount | null;
  tenantId: string | null;
  subscriptionId: string;
};

export type UseCreateAdminUsersCard = CardHook & {
  readonly cardId: "create_admin_users";
  admins: AdminRow[];
  rowErrors: Record<string, string>;
  rowWarnings: Record<string, string>; // A row whose UPN Entra already has; the run reuses that account instead of creating one.
  duplicateUpns: Record<string, { upn: string; row: number }>; // A row whose UPN an earlier row already uses.
  takenUpns: Set<string>; // Lowercase UPNs from the rows that Entra already has.
  addAdmin: () => string; // Returns the new row's key.
  updateAdmin: (key: string, patch: Partial<Omit<AdminRow, "key">>) => void;
  removeAdmin: (key: string) => void;
  searchUsers: (query: string) => Promise<EntraUser[]>; // For the manager picker.
  signedInUser: EntraUser | null; // Every user account's default manager; null until read.
  domains: VerifiedDomain[] | null; // The tenant's verified domains; null until read.
  primaryDomain: string; // Empty until the domains are read.
  missingGroups: string[] | null; // Null until Entra was read.
  existingAdmins: AdminPair[] | null; // Admins already in Entra; null until read.
  waitingAdmins: WaitingAdmin[]; // A run finished them, but Entra doesn't list them as existing yet.
  existingAndWaitingAdmins: AdminPair[]; // existingAdmins and waitingAdmins; the manager picker and the employee ID check treat both as existing.
  checking: boolean; // Entra is being read again.
  recheck: () => void; // Reads Entra again, for the admins it doesn't list yet.
  entraLicence: LicenceState;
  licenceError: string | null; // Why the licence couldn't be read, unless it's missing consent.
  roleTarget: RoleTarget; // Who holds PrivilegedAccounts' Global Administrator.
  usePim: boolean; // PrivilegedAccounts' roles are eligible rather than active.
  setUsePim: (pim: boolean) => void;
  access: CardResourceAccess;
  steps: SetupStep[];
  running: boolean;
  canRun: boolean;
  run: () => Promise<void>;
  reset: () => void;
  consentRequired: boolean;
  // requestConsent: () => Promise<void>; // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
  error: string | null; // Reading the groups or admins failed.
};

export function useCreateAdminUsersCard({ azureAccount, tenantId, subscriptionId }: UseCreateAdminUsersCardParams): UseCreateAdminUsersCard {
  // The user's input.
  const [admins, setAdmins] = useState<AdminRow[]>(() => [newAdmin()]);
  const [pimChoice, setUsePim] = useState<boolean | null>(null);
  const addAdmin = useCallback(() => {
    const admin = newAdmin();
    setAdmins((prev) => [...prev, admin]);
    return admin.key;
  }, []);
  const updateAdmin = useCallback((key: string, patch: Partial<Omit<AdminRow, "key">>) => {
    setAdmins((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }, []);
  const removeAdmin = useCallback((key: string) => setAdmins((prev) => prev.filter((a) => a.key !== key)), []);

  const [created, dispatchCreated] = useReducer(waitingReducer, []);

  // Reads; the directory is read again after each run.
  const [checkKey, setCheckKey] = useState(0);
  const { missingGroups, existingAdmins, signedInUser, checking, error: directoryError } = useAdminDirectory(azureAccount, tenantId, checkKey);
  const recheck = useCallback(() => setCheckKey((key) => key + 1), []);
  const { entraLicence, domains, error: tenantError } = useLicenceAndDomains(azureAccount, tenantId);
  const primaryDomain = domains?.find((d) => d.isDefault)?.name ?? "";
  const takenUpns = useTakenUpns(azureAccount, tenantId, admins.flatMap((a) => rowUpns(a, primaryDomain)));
  const tid = tenantId || undefined;
  const findUsers = useCallback((query: string) => (azureAccount ? searchUsers(azureAccount, query, tid) : Promise.resolve([])), [azureAccount, tid]);

  // Derived on every render.
  const roleTarget: RoleTarget = licenceAllows("p1", entraLicence) ? "group" : "users";
  const usePim = licenceAllows(PIM_OPTION.needs, entraLicence) && (pimChoice ?? true);
  const access = useCardResourceAccess({ azureAccount, subscriptionId, tenantId: tid }, createAdminUsersAccess(usePim));
  // Their accounts exist, so they count as existing while Entra doesn't list them yet.
  const waitingAdmins = created.filter((createdAdmin) => !existingAdmins?.some((pair) => pair.user.id === createdAdmin.user.id));
  const existingAndWaitingAdmins = [...(existingAdmins ?? []), ...waitingAdmins];
  const rowErrors = adminRowErrors(admins, existingAndWaitingAdmins, primaryDomain);
  const rowWarnings = adminRowWarnings(admins, primaryDomain, takenUpns, rowErrors);
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const canRun = !running && !!primaryDomain && !!signedInUser && access.status === "ready" && licenceAllows("none", entraLicence) && Object.keys(rowErrors).length === 0;

  // The run: steps.ts does the work; the hook keeps the checklist and the consent flag.
  const [runNeedsConsent, setRunNeedsConsent] = useState(false);
  const run = useCallback(async () => {
    if (!azureAccount || !tenantId || !signedInUser || !canRun) return;
    const input = { azureAccount, tenantId, subscriptionId, admins, primaryDomain, signedInUser, roleTarget, usePim };
    setSteps(adminUsersSteps(input).map((s) => ({ ...s, status: "pending" as const })));
    setRunning(true);
    setRunNeedsConsent(false);
    const fail = (id: string, err: unknown) => {
      const msg = errorText(err);
      if (isConsentError(msg)) setRunNeedsConsent(true);
      updateStep(id, "error", msg);
    };
    try {
      const finished = await runAdminUsers({ ...input, updateStep, fail });
      // Finished admins can't be edited or run again; they wait, read-only, until a read after the run lists them as existing.
      dispatchCreated({ type: "created", admins: finished });
      setAdmins((prev) => withoutCreated(prev, finished));
    } finally {
      setRunning(false);
      setCheckKey((k) => k + 1);
    }
  }, [azureAccount, tenantId, canRun, signedInUser, primaryDomain, admins, subscriptionId, roleTarget, usePim, setSteps, setRunning, updateStep]);

  // The reads after a run; a run that creates admins starts them again, and they stop once Entra lists everyone.
  const allListed = waitingAdmins.length === 0;
  useEffect(() => {
    if (allListed) return;
    const timers = RECHECK_DELAYS_MS.map((delay, index) =>
      setTimeout(() => {
        setCheckKey((key) => key + 1);
        if (index === RECHECK_DELAYS_MS.length - 1) dispatchCreated({ type: "timedOut" });
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [created.length, allListed]);

  // const requestConsent = useCallback(async () => { // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
  //   if (!azureAccount) return;
  //   const msal = await getMsal();
  //   await msal?.acquireTokenRedirect({
  //     scopes: ADMIN_USERS_SCOPES,
  //     account: azureAccount,
  //     authority: `https://login.microsoftonline.com/${tenantId || azureAccount.tenantId}`,
  //   });
  // }, [azureAccount, tenantId]);

  // A read that failed for missing consent shows the consent notice instead of its error.
  const consentRequired = runNeedsConsent || [directoryError, tenantError].some((e) => !!e && isConsentError(e));
  const error = directoryError && !isConsentError(directoryError) ? directoryError : null;
  const licenceError = tenantError && !isConsentError(tenantError) ? tenantError : null;
  const done = !!missingGroups && missingGroups.length === 0;
  const failed = !!error || steps.some((s) => s.status === "error");
  const status: CardStatus = !AZURE_CLIENT_ID || failed || access.status === "error" ? "error" : done ? "complete" : "warning";
  const summary = !AZURE_CLIENT_ID
    ? "Unavailable"
    : access.status === "error"
      ? "Insufficient permissions to continue"
      : done
        ? "Admin groups are in Entra"
        : missingGroups
          ? `${missingGroups.length} of ${ADMIN_GROUPS.length} groups missing`
          : "Checking groups...";

  return {
    cardId: "create_admin_users",
    status,
    summary,
    cardRequirements: ["azure_login", "azure_subscription", "create_domain"], // admin accounts use the verified corp domain
    cardDependencyLabel: CREATE_ADMIN_USERS_TITLE,
    done,
    admins,
    rowErrors,
    rowWarnings,
    duplicateUpns: duplicateUpns(admins),
    takenUpns,
    addAdmin,
    updateAdmin,
    removeAdmin,
    searchUsers: findUsers,
    signedInUser,
    domains,
    primaryDomain,
    missingGroups,
    existingAdmins,
    waitingAdmins,
    existingAndWaitingAdmins,
    checking,
    recheck,
    entraLicence,
    licenceError,
    roleTarget,
    usePim,
    setUsePim,
    access,
    steps,
    running,
    canRun,
    run,
    reset: resetSteps,
    consentRequired,
    // requestConsent, // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
    error,
  };
}
