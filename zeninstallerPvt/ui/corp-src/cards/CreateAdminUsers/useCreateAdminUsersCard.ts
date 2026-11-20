/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
// import { getMsal } from "../../auth/msal"; // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
import { AZURE_CLIENT_ID, DIRECTORY_ROLE_IDS } from "../../config/azureConfig";
import {
  addGroupMember,
  createGroup,
  createUser,
  ensureDirectoryRoleAssignment,
  ensureDirectoryRoleEligibility,
  ensureFido2Enabled,
  getGroupByName,
  getUserByUpn,
  getEntraLicence,
  getSignedInUser,
  getUserManagerId,
  isGroupMember,
  listAdminPairs,
  listVerifiedDomainsViaOrganization,
  searchUsers,
  setUserManager,
  type AdminPair,
  type EntraUser,
  type VerifiedDomain,
} from "../../api/azureGraph";
import { ensureRbacRoleAtScope, ensureRbacRoleEligibility } from "../../api/azureArm";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { isConsentError } from "../../logic/consent";
import { generateRandomPassword } from "../../logic/password";
import { createRandomUuid } from "../../logic/randomUuid";
import type { AzureAccount, CardHook, CardStatus, SetupStep } from "../../types";
import {
  ADMIN_GROUPS,
  // ADMIN_USERS_SCOPES, // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
  createAdminUsersAccess,
  CREATE_ADMIN_USERS_TITLE,
  PRIVILEGED_ACCOUNT_GROUPS,
  PRIVILEGED_GROUP,
  PIM_OPTION,
  USER_ACCOUNT_GROUPS,
  licenceAllows,
  roleLabel,
  type LicenceState,
  type RoleTarget,
} from "./config";

// A manager of the same kind: another admin in this list (their matching account), or an existing Entra user.
export type ManagerChoice = { kind: "row"; key: string } | ({ kind: "entra" } & EntraUser);

export type AdminRow = {
  key: string;
  givenName: string; // Legal name, as on the passport.
  surname: string;
  mobile: string;
  employeeId: string; // The same on both accounts.
  displayName: string | null; // Null follows the default; the same for username.
  username: string | null; // The user account's UPN, before the @; the privileged account is always adm_ + this.
  domain: string | null; // After the @, for both accounts; null for the primary domain.
  manager: ManagerChoice | null; // The user account's manager; null for the signed-in user. Another admin in this list must be above this one.
  // privilegedManager: ManagerChoice | null; // Deprecated: the adm_ account's manager is always its user account; kept for reference.
};

export type ResolvedAdmin = { displayName: string; username: string; privilegedUsername: string; privilegedDisplayName: string };

const toUpnPart = (name: string) =>
  name.normalize("NFD").replace(/\p{M}/gu, "").trim().split(/\s+/).join(".").replace(/[^A-Za-z0-9._-]/g, "");

// Legal names give the display name ("First Surname"), the display name gives the UPN (First.Surname), and the UPN gives adm_First.Surname.
export function resolveAdmin(a: AdminRow): ResolvedAdmin {
  const displayName = a.displayName ?? `${a.givenName.trim()} ${a.surname.trim()}`.trim();
  const username = a.username ?? toUpnPart(displayName);
  return {
    displayName,
    username,
    privilegedUsername: username ? `adm_${username}` : "",
    privilegedDisplayName: displayName.trim() ? `${displayName.trim()} Admin` : "",
  };
}

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

const USERNAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
const MOBILE = /^\+?[0-9][0-9 ()-]{5,19}$/;

const newAdmin = (): AdminRow => ({
  key: createRandomUuid(),
  givenName: "",
  surname: "",
  mobile: "",
  employeeId: "",
  displayName: null,
  username: null,
  domain: null,
  manager: null,
  // privilegedManager: null, // Deprecated: the adm_ account's manager is always its user account; kept for reference.
});

// Whether any group sits in another; the nesting step shows only then.
const NESTED = ADMIN_GROUPS.some((g) => g.memberOf.length > 0);

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Each row with a UPN an earlier row already uses: that UPN, before the @, as typed, and the earlier row's number.
export function duplicateUpns(admins: AdminRow[]): Record<string, { upn: string; row: number }> {
  const seen = new Map<string, number>();
  const duplicates: Record<string, { upn: string; row: number }> = {};
  admins.forEach((a, i) => {
    const r = resolveAdmin(a);
    const names = [r.username, r.privilegedUsername].map((n) => n.trim()).filter(Boolean);
    const upn = names.find((n) => seen.has(n.toLowerCase()));
    if (upn) duplicates[a.key] = { upn, row: seen.get(upn.toLowerCase()) ?? 0 };
    for (const n of names) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), i + 1);
  });
  return duplicates;
}

// existing: admins already in Entra; their employee IDs are taken, except by a rerun for the same user account.
export function adminRowErrors(admins: AdminRow[], existing: readonly AdminPair[] = [], primaryDomain = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  // const seen = new Set<string>(); // Deprecated: duplicateUpns finds the repeats; kept for reference.
  const duplicates = duplicateUpns(admins);
  const employeeIds = new Set<string>();
  for (const a of admins) {
    const r = resolveAdmin(a);
    // const names = [r.username, r.privilegedUsername].map((n) => n.trim().toLowerCase()); // Deprecated: duplicateUpns finds the repeats; kept for reference.
    const duplicate = duplicates[a.key];
    const employeeId = a.employeeId.trim().toLowerCase();
    const upn = `${r.username.trim()}@${a.domain ?? primaryDomain}`.toLowerCase();
    const owner = !!(a.domain ?? primaryDomain) && existing.find((x) => x.user.employeeId?.trim().toLowerCase() === employeeId && x.user.userPrincipalName.toLowerCase() !== upn);
    if (!a.givenName.trim() || !a.surname.trim()) errors[a.key] = "Enter the first name and surname.";
    else if (!MOBILE.test(a.mobile.trim())) errors[a.key] = "Enter a mobile number, e.g. +61 400 000 000.";
    else if (!a.employeeId.trim()) errors[a.key] = "Enter the employee ID.";
    else if (employeeIds.has(a.employeeId.trim().toLowerCase())) errors[a.key] = "Each admin needs their own employee ID.";
    else if (owner) errors[a.key] = `Employee ID ${a.employeeId.trim()} belongs to ${owner.user.userPrincipalName}, an existing admin.`;
    else if (!r.displayName.trim()) errors[a.key] = "Enter a display name.";
    else if (!USERNAME.test(r.username.trim())) errors[a.key] = "Use letters, numbers, dots, hyphens or underscores in the UPN.";
    // else if (names.some((n) => seen.has(n))) errors[a.key] = "Each account needs its own UPN."; // Deprecated: the error names the UPN and the other row now; kept for reference.
    else if (duplicate) errors[a.key] = `User ${duplicate.row} already uses ${duplicate.upn}; each account needs its own UPN.`;
    // else if ([a.manager, a.privilegedManager].some((m) => m?.kind === "row" && !admins.some((o) => o.key === m.key))) errors[a.key] = "Pick another manager; that user was removed."; // Deprecated: only the user account has a pick; kept for reference.
    else if ([a.manager].some((m) => m?.kind === "row" && !admins.some((o) => o.key === m.key))) errors[a.key] = "Pick another manager; that user was removed.";
    // for (const n of names) seen.add(n); // Deprecated: duplicateUpns finds the repeats; kept for reference.
    employeeIds.add(a.employeeId.trim().toLowerCase());
  }
  return errors;
}

export function useCreateAdminUsersCard({ azureAccount, tenantId, subscriptionId }: UseCreateAdminUsersCardParams): UseCreateAdminUsersCard {
  const [admins, setAdmins] = useState<AdminRow[]>(() => [newAdmin()]);
  const [missingGroups, setMissingGroups] = useState<string[] | null>(null);
  const [existingAdmins, setExistingAdmins] = useState<AdminPair[] | null>(null);
  const [signedInUser, setSignedInUser] = useState<EntraUser | null>(null);
  const [takenUpns, setTakenUpns] = useState<Set<string>>(new Set()); // Lowercase UPNs from the rows that Entra already has.
  const [checkKey, setCheckKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [entraLicence, setEntraLicence] = useState<LicenceState>(null);
  const [licenceError, setLicenceError] = useState<string | null>(null);
  const [domains, setDomains] = useState<VerifiedDomain[] | null>(null);
  const [pimChoice, setUsePim] = useState<boolean | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const tid = tenantId || undefined;

  // The card is done once every group exists; the admins it already made are listed too.
  useEffect(() => {
    if (!azureAccount || !tenantId) return;
    let cancelled = false;
    Promise.all([Promise.all(ADMIN_GROUPS.map((g) => getGroupByName(azureAccount, g.name, tid))), listAdminPairs(azureAccount, { user: USER_ACCOUNT_GROUPS, privileged: PRIVILEGED_ACCOUNT_GROUPS }, tid), getSignedInUser(azureAccount, tid)]).then(
      ([found, pairs, me]) => {
        if (cancelled) return;
        setMissingGroups(ADMIN_GROUPS.filter((_, i) => !found[i]).map((g) => g.name));
        setExistingAdmins(pairs);
        setSignedInUser(me);
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        const msg = errorText(err);
        if (isConsentError(msg)) setConsentRequired(true);
        else setError(msg);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, tenantId, tid, checkKey]);

  // Reads the licence, which selects the role-assignment mode and PIM, and the verified domains; both need the same permission.
  useEffect(() => {
    if (!azureAccount || !tenantId) return;
    let cancelled = false;
    Promise.all([getEntraLicence(azureAccount, tid), listVerifiedDomainsViaOrganization(azureAccount, tid)]).then(
      ([licence, verified]) => {
        if (cancelled) return;
        setEntraLicence(licence);
        setDomains(verified);
      },
      (err) => {
        if (cancelled) return;
        const msg = errorText(err);
        if (isConsentError(msg)) setConsentRequired(true);
        else setLicenceError(msg);
        setEntraLicence("unknown");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, tenantId, tid]);

  const addAdmin = useCallback(() => {
    const admin = newAdmin();
    setAdmins((prev) => [...prev, admin]);
    return admin.key;
  }, []);
  const updateAdmin = useCallback((key: string, patch: Partial<Omit<AdminRow, "key">>) => {
    setAdmins((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }, []);
  const removeAdmin = useCallback((key: string) => setAdmins((prev) => prev.filter((a) => a.key !== key)), []);
  const findUsers = useCallback((query: string) => (azureAccount ? searchUsers(azureAccount, query, tid) : Promise.resolve([])), [azureAccount, tid]);

  const primaryDomain = domains?.find((d) => d.isDefault)?.name ?? "";
  const roleTarget: RoleTarget = licenceAllows("p1", entraLicence) ? "group" : "users";
  const usePim = licenceAllows(PIM_OPTION.needs, entraLicence) && (pimChoice ?? true);
  const access = useCardResourceAccess({ azureAccount, subscriptionId, tenantId: tid }, createAdminUsersAccess(usePim));
  const rowErrors = adminRowErrors(admins, existingAdmins ?? [], primaryDomain);
  // Each row's user and adm_ UPNs.
  const rowUpns = (a: AdminRow) => {
    const r = resolveAdmin(a);
    const domain = a.domain ?? primaryDomain;
    return r.username.trim() && domain ? [`${r.username.trim()}@${domain}`, `${r.privilegedUsername.trim()}@${domain}`] : [];
  };
  const upns = [...new Set(admins.flatMap(rowUpns))].join(" ");
  // Looks the UPNs up in Entra once typing stops.
  useEffect(() => {
    if (!azureAccount || !upns) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const list = upns.split(" ");
      void Promise.all(list.map((upn) => getUserByUpn(azureAccount, upn, tid).then((u) => !!u, () => false))).then((found) => {
        if (!cancelled) setTakenUpns(new Set(list.filter((_, i) => found[i]).map((upn) => upn.toLowerCase())));
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [azureAccount, tid, upns]);
  // A warning, not an error: a rerun finds the accounts it already made.
  const rowWarnings = Object.fromEntries(admins.flatMap((a) => {
    const existing = rowUpns(a).filter((upn) => takenUpns.has(upn.toLowerCase()));
    return existing.length && !rowErrors[a.key] ? [[a.key, `Already in Entra: ${existing.join(", ")}. Running reuses ${existing.length > 1 ? "these accounts" : "this account"} instead of creating one.`]] : [];
  }));
  const canRun = !running && !!primaryDomain && !!signedInUser && access.status === "ready" && licenceAllows("none", entraLicence) && Object.keys(rowErrors).length === 0;

  const run = useCallback(async () => {
    if (!azureAccount || !tenantId || !signedInUser || !canRun) return;
    // Every admin gets a user account and an adm_ account, each in its fixed groups.
    const accounts = admins.flatMap((a) => {
      const r = resolveAdmin(a);
      const domain = a.domain ?? primaryDomain;
      return [
        { a, kind: "user", upn: `${r.username.trim()}@${domain}`, displayName: r.displayName.trim(), groups: USER_ACCOUNT_GROUPS },
        { a, kind: "priv", upn: `${r.privilegedUsername.trim()}@${domain}`, displayName: r.privilegedDisplayName, groups: PRIVILEGED_ACCOUNT_GROUPS },
      ];
    });
    // Assigned to users, the accounts hold PrivilegedAccounts' directory roles; with PIM its roles are eligible.
    const toUsers = roleTarget === "users";
    const roleSteps = ADMIN_GROUPS.flatMap((g) =>
      g.roles.flatMap((role, i) => {
        const privileged = g.name === PRIVILEGED_GROUP;
        if (privileged && toUsers && "directoryRole" in role) return [];
        const eligible = privileged && usePim;
        return [{ id: `role:${g.name}:${i}`, group: g, role, eligible, label: eligible ? `Make ${g.name} eligible for ${roleLabel(role)}` : `Assign ${roleLabel(role)} to ${g.name}` }];
      })
    );
    const userRoles = toUsers
      ? ADMIN_GROUPS.find((g) => g.name === PRIVILEGED_GROUP)!.roles.flatMap((r) => ("directoryRole" in r ? [r.directoryRole] : [])) : [];
    setSteps(
      [
        { id: "groups", label: "Create the security groups" },
        ...(NESTED ? [{ id: "nesting", label: "Nest the groups" }] : []),
        ...roleSteps.map(({ id, label }) => ({ id, label })),
        { id: "fido2", label: "Allow passkey (FIDO2) sign-in" },
        ...accounts.map((acc) => ({ id: `${acc.kind}:${acc.a.key}`, label: `Create ${acc.upn}` })),
        // ...(accounts.some((acc) => acc.manager) ? [{ id: "managers", label: "Set the managers" }] : []), // Deprecated: each account's manager is set as it is created; kept for reference.
      ].map((s) => ({ ...s, status: "pending" as const }))
    );
    setRunning(true);
    setConsentRequired(false);
    const fail = (id: string, err: unknown) => {
      const msg = errorText(err);
      if (isConsentError(msg)) setConsentRequired(true);
      updateStep(id, "error", msg);
    };

    try {
      // Every later step needs the group ids, so a failure here stops the run.
      updateStep("groups", "running");
      const ids = new Map<string, string>();
      try {
        const created: string[] = [];
        for (const g of ADMIN_GROUPS) {
          let group = await getGroupByName(azureAccount, g.name, tid);
          if (!group) {
            const mailNickname = g.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            group = await createGroup(azureAccount, { displayName: g.name, description: g.description, mailNickname, isAssignableToRole: !!g.roleAssignable && !toUsers }, tid);
            created.push(g.name);
          }
          ids.set(g.name, group.id);
        }
        updateStep("groups", created.length ? "done" : "skipped", created.length ? `Created ${created.join(", ")}` : "All exist");
      } catch (err) {
        fail("groups", err);
        return;
      }

      updateStep("nesting", "running"); // A no-op without the step.
      try {
        let added = 0;
        for (const g of ADMIN_GROUPS) {
          for (const parent of g.memberOf) {
            if (await isGroupMember(azureAccount, ids.get(parent)!, ids.get(g.name)!, tid)) continue;
            await addGroupMember(azureAccount, ids.get(parent)!, ids.get(g.name)!, tid);
            added++;
          }
        }
        updateStep("nesting", added ? "done" : "skipped", added ? undefined : "Already nested");
      } catch (err) {
        fail("nesting", err);
      }

      for (const { id, group, role, eligible } of roleSteps) {
        updateStep(id, "running");
        try {
          const principalId = ids.get(group.name)!;
          let result: "created" | "exists";
          if ("directoryRole" in role) {
            const ensure = eligible ? ensureDirectoryRoleEligibility : ensureDirectoryRoleAssignment;
            result = await ensure(azureAccount, principalId, DIRECTORY_ROLE_IDS[role.directoryRole], tid);
          } else {
            const scope = role.scope === "root" ? `/providers/Microsoft.Management/managementGroups/${tenantId}` : `/subscriptions/${subscriptionId}`;
            result = eligible
              ? await ensureRbacRoleEligibility(azureAccount, scope, principalId, role.azureRole, tid)
              : await ensureRbacRoleAtScope(azureAccount, scope, principalId, role.azureRole, tid, "Group");
          }
          updateStep(id, result === "exists" ? "skipped" : "done", result === "exists" ? (eligible ? "Already eligible" : "Already assigned") : undefined);
        } catch (err) {
          fail(id, err);
        }
      }

      // The accounts sign in with passkeys; they're still created if this fails.
      updateStep("fido2", "running");
      try {
        const turnedOn = await ensureFido2Enabled(azureAccount, tid); // Tenant-wide; the targets it already has stay.
        updateStep("fido2", turnedOn ? "done" : "skipped", turnedOn ? "Turned on" : "Already on");
      } catch (err) {
        fail("fido2", err);
      }

      // Step id → account; a manager from this list is above its reports, so it's created first.
      const users = new Map<string, { id: string; existed: boolean; displayName: string }>();
      // An adm_ account's manager is the same admin's user account; a user account's is the pick, else the signed-in user.
      // A pick from this list is that admin's user account.
      const managerOf = (a: AdminRow, kind: string) => {
        if (kind === "priv") return users.get(`user:${a.key}`);
        if (!a.manager) return signedInUser;
        return a.manager.kind === "row" ? users.get(`user:${a.manager.key}`) : a.manager;
      };
      for (const { a, kind, upn, displayName, groups } of accounts) {
        const stepId = `${kind}:${a.key}`;
        updateStep(stepId, "running");
        // No account is created without a manager.
        const manager = managerOf(a, kind);
        if (!manager) {
          updateStep(stepId, "error", kind === "priv" ? "Not created, because the user account failed" : "Not created, because its manager's account failed");
          continue;
        }
        try {
          let user = await getUserByUpn(azureAccount, upn, tid);
          const existed = !!user;
          if (!user) {
            user = await createUser(
              azureAccount,
              {
                userPrincipalName: upn,
                displayName,
                givenName: a.givenName.trim(),
                surname: a.surname.trim(),
                mobilePhone: a.mobile.trim(),
                employeeId: a.employeeId.trim(),
                mailNickname: upn.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
                password: generateRandomPassword(30),
              },
              tid
            );
          }
          // Graph can't set the manager in the create call; if this fails, a rerun finds the account without one and sets it.
          // An existing account keeps the manager it has.
          const kept = existed && !!(await getUserManagerId(azureAccount, user.id, tid));
          if (!kept) await setUserManager(azureAccount, user.id, manager.id, tid);
          users.set(stepId, { id: user.id, existed, displayName }); // Has a manager, so its reports can be created.
          for (const name of groups) {
            if (!(await isGroupMember(azureAccount, ids.get(name)!, user.id, tid))) await addGroupMember(azureAccount, ids.get(name)!, user.id, tid);
          }
          const roles = groups.includes(PRIVILEGED_GROUP) ? userRoles : [];
          const ensureRole = usePim ? ensureDirectoryRoleEligibility : ensureDirectoryRoleAssignment;
          for (const role of roles) await ensureRole(azureAccount, user.id, DIRECTORY_ROLE_IDS[role], tid);
          const membership = [
            kept ? "manager kept" : `manager ${manager.displayName}`,
            groups.length ? `member of ${groups.join(", ")}` : "in no groups",
            ...roles.map((r) => (usePim ? `eligible for ${r}` : r)),
          ].join(", ");
          updateStep(stepId, "done", existed ? `Already existed, ${membership}` : `Created, ${membership}`);
        } catch (err) {
          fail(stepId, err);
        }
      }

      // Deprecated: each account's manager is set as it is created; kept for reference.
      // if (accounts.some((acc) => acc.manager)) {
      //   updateStep("managers", "running");
      //   try {
      //     let set = 0;
      //     for (const { a, kind, manager: m } of accounts) {
      //       const user = users.get(`${kind}:${a.key}`);
      //       if (!user || !m) continue; // Its account failed, or it has no manager.
      //       const managerId = m.kind === "row" ? users.get(`${kind}:${m.key}`)?.id : m.id; // From this list: their account of the same kind.
      //       // An existing account keeps the manager it has.
      //       if (!managerId || (user.existed && (await getUserManagerId(azureAccount, user.id, tid)))) continue;
      //       await setUserManager(azureAccount, user.id, managerId, tid);
      //       set++;
      //     }
      //     updateStep("managers", set ? "done" : "skipped", set ? `Set for ${set} user${set > 1 ? "s" : ""}` : "Already set");
      //   } catch (err) {
      //     fail("managers", err);
      //   }
      // }
    } finally {
      setRunning(false);
      setCheckKey((k) => k + 1);
    }
  }, [azureAccount, tenantId, tid, canRun, signedInUser, primaryDomain, admins, subscriptionId, roleTarget, usePim, setSteps, setRunning, updateStep]);

  // const requestConsent = useCallback(async () => { // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
  //   if (!azureAccount) return;
  //   const msal = await getMsal();
  //   await msal?.acquireTokenRedirect({
  //     scopes: ADMIN_USERS_SCOPES,
  //     account: azureAccount,
  //     authority: `https://login.microsoftonline.com/${tenantId || azureAccount.tenantId}`,
  //   });
  // }, [azureAccount, tenantId]);

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
