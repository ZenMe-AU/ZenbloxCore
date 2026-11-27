/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// The run: its checklist, then one function per step. No React; each step reports through updateStep and fail.

import { DIRECTORY_ROLE_IDS } from "../../config/azureConfig";
import {
  addGroupMember,
  createGroup,
  createUser,
  ensureDirectoryRoleAssignment,
  ensureDirectoryRoleEligibility,
  ensureFido2Enabled,
  getGroupByName,
  getUserByUpn,
  getUserManagerId,
  isGroupMember,
  setUserManager,
  updateUser,
  type AdminAccount,
  type EntraUser,
  type EntraUserRef,
} from "../../api/azureGraph";
import { ensureRbacRoleAtScope, ensureRbacRoleEligibility } from "../../api/azureArm";
import { generateRandomPassword } from "../../logic/password";
import type { AzureAccount, SetupStep } from "../../types";
import { ADMIN_GROUPS, PRIVILEGED_ACCOUNT_GROUPS, PRIVILEGED_GROUP, USER_ACCOUNT_GROUPS, roleLabel, type RoleTarget } from "./config";
import { byManager, resolveAdmin, type AdminRow, type CreatedAdmin, type FoundAccount } from "./logic";

// What the run works on; the card hook runs only once all of it is there.
export type AdminUsersInput = {
  azureAccount: AzureAccount;
  tenantId: string;
  subscriptionId: string;
  admins: AdminRow[];
  defaultDomain: string;
  signedInUser: EntraUser;
  roleTarget: RoleTarget;
  usePim: boolean;
  takenUpns: ReadonlyMap<string, FoundAccount>; // Accounts Entra already has under the rows' UPNs; a confirmed one is updated, not created.
};

export type AdminUsersRun = AdminUsersInput & {
  updateStep: (id: string, status: SetupStep["status"], detail?: string) => void;
  fail: (id: string, err: unknown) => void; // Marks the step failed.
};

// Whether any group sits in another; the nesting step shows only then.
const NESTED = ADMIN_GROUPS.some((g) => g.memberOf.length > 0);

// Every admin gets a user account and an adm_ account, each in its fixed groups; managers from this list come first.
function accountsOf({ admins, defaultDomain }: AdminUsersInput) {
  return byManager(admins).flatMap((a) => {
    const r = resolveAdmin(a);
    const domain = a.domain ?? defaultDomain;
    return [
      { a, kind: "user", upn: `${r.username.trim()}@${domain}`, displayName: r.displayName.trim(), groups: USER_ACCOUNT_GROUPS },
      { a, kind: "priv", upn: `${r.privilegedUsername.trim()}@${domain}`, displayName: r.privilegedDisplayName, groups: PRIVILEGED_ACCOUNT_GROUPS },
    ];
  });
}

// Assigned to users, the accounts hold PrivilegedAccounts' directory roles; with PIM its roles are eligible.
function roleStepsOf({ roleTarget, usePim }: AdminUsersInput) {
  const toUsers = roleTarget === "users";
  return ADMIN_GROUPS.flatMap((g) =>
    g.roles.flatMap((role, i) => {
      const privileged = g.name === PRIVILEGED_GROUP;
      if (privileged && toUsers && "directoryRole" in role) return [];
      const eligible = privileged && usePim;
      return [{ id: `role:${g.name}:${i}`, group: g, role, eligible, label: eligible ? `Make ${g.name} eligible for ${roleLabel(role)}` : `Assign ${roleLabel(role)} to ${g.name}` }];
    })
  );
}

// The checklist, in the order the run goes.
export function adminUsersSteps(input: AdminUsersInput): { id: string; label: string }[] {
  const accounts = accountsOf(input);
  const reused = (upn: string, admin: AdminRow) => {
    const account = input.takenUpns.get(upn.toLowerCase());
    return !!account && admin.confirmedAccountIds.includes(account.id);
  };
  return [
    { id: "groups", label: "Create the security groups" },
    ...(NESTED ? [{ id: "nesting", label: "Nest the groups" }] : []),
    ...roleStepsOf(input).map(({ id, label }) => ({ id, label })),
    { id: "fido2", label: "Allow passkey (FIDO2) sign-in" },
    ...accounts.map((acc) => ({ id: `${acc.kind}:${acc.a.key}`, label: `${reused(acc.upn, acc.a) ? "Update" : "Create"} ${acc.upn}` })),
    // ...(accounts.some((acc) => acc.manager) ? [{ id: "managers", label: "Set the managers" }] : []), // Deprecated: each account's manager is set as it is created; kept for reference.
  ];
}

// Runs the checklist in order. A failed step stops only the steps that need it.
// Returns the admins whose two accounts are both done.
export async function runAdminUsers(run: AdminUsersRun): Promise<CreatedAdmin[]> {
  const ids = await createGroups(run);
  if (!ids) return []; // Every later step needs the group ids.
  await nestGroups(run, ids);
  await assignGroupRoles(run, ids);
  await allowFido2(run);
  return createAccounts(run, ids);
}

// Finds or creates each group; returns their ids, or null if this failed.
async function createGroups({ azureAccount, tenantId: tid, roleTarget, updateStep, fail }: AdminUsersRun): Promise<Map<string, string> | null> {
  const toUsers = roleTarget === "users";
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
    return ids;
  } catch (err) {
    fail("groups", err);
    return null;
  }
}

async function nestGroups({ azureAccount, tenantId: tid, updateStep, fail }: AdminUsersRun, ids: Map<string, string>) {
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
}

async function assignGroupRoles(run: AdminUsersRun, ids: Map<string, string>) {
  const { azureAccount, tenantId: tid, subscriptionId, updateStep, fail } = run;
  for (const { id, group, role, eligible } of roleStepsOf(run)) {
    updateStep(id, "running");
    try {
      const principalId = ids.get(group.name)!;
      let result: "created" | "exists";
      if ("directoryRole" in role) {
        const ensure = eligible ? ensureDirectoryRoleEligibility : ensureDirectoryRoleAssignment;
        result = await ensure(azureAccount, principalId, DIRECTORY_ROLE_IDS[role.directoryRole], tid);
      } else {
        const scope = role.scope === "root" ? `/providers/Microsoft.Management/managementGroups/${tid}` : `/subscriptions/${subscriptionId}`;
        result = eligible
          ? await ensureRbacRoleEligibility(azureAccount, scope, principalId, role.azureRole, tid)
          : await ensureRbacRoleAtScope(azureAccount, scope, principalId, role.azureRole, tid, "Group");
      }
      updateStep(id, result === "exists" ? "skipped" : "done", result === "exists" ? (eligible ? "Already eligible" : "Already assigned") : undefined);
    } catch (err) {
      fail(id, err);
    }
  }
}

// The accounts sign in with passkeys; they're still created if this fails.
async function allowFido2({ azureAccount, tenantId: tid, updateStep, fail }: AdminUsersRun) {
  updateStep("fido2", "running");
  try {
    const turnedOn = await ensureFido2Enabled(azureAccount, tid); // Tenant-wide; the targets it already has stay.
    updateStep("fido2", turnedOn ? "done" : "skipped", turnedOn ? "Turned on" : "Already on");
  } catch (err) {
    fail("fido2", err);
  }
}

async function createAccounts(run: AdminUsersRun, ids: Map<string, string>): Promise<CreatedAdmin[]> {
  const { azureAccount, tenantId: tid, signedInUser, usePim, updateStep, fail } = run;
  const accounts = accountsOf(run);
  // Assigned to users, the accounts hold PrivilegedAccounts' directory roles themselves.
  const userRoles = run.roleTarget === "users"
    ? ADMIN_GROUPS.find((g) => g.name === PRIVILEGED_GROUP)!.roles.flatMap((r) => ("directoryRole" in r ? [r.directoryRole] : [])) : [];
  // Step id → account; accounts go in manager order, so a manager from this list is created first.
  const users = new Map<string, { id: string; existed: boolean; displayName: string }>();
  const done = new Map<string, AdminAccount>(); // Step id → its account, once account, manager, groups and roles are all set.
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
      const found = await getUserByUpn(azureAccount, upn, tid);
      // An account Entra already has is reused only if the operator confirmed it's this person; otherwise nothing changes.
      if (found && !a.confirmedAccountIds.includes(found.id)) {
        updateStep(stepId, "error", `${upn} is already in Entra and wasn't confirmed as this person, so nothing was changed.`);
        continue;
      }
      let user: EntraUserRef | null = found;
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
      // An existing user account keeps the manager it has; an adm_ account's is always its user account, or Entra can't pair the two.
      const kept = kind === "user" && existed && !!(await getUserManagerId(azureAccount, user.id, tid));
      if (!kept) await setUserManager(azureAccount, user.id, manager.id, tid);
      // An existing account without an employee ID gets this one; Entra pairs the two accounts by it.
      const backfill = !!found && !found.employeeId?.trim();
      if (backfill) await updateUser(azureAccount, user.id, { employeeId: a.employeeId.trim() }, tid);
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
        ...(backfill ? [`employee ID ${a.employeeId.trim()} added`] : []),
      ].join(", ");
      updateStep(stepId, "done", existed ? `Already existed, ${membership}` : `Created, ${membership}`);
      // A kept manager isn't read here, so it shows as none until Entra lists the admin.
      done.set(stepId, { id: user.id, displayName, userPrincipalName: upn, employeeId: a.employeeId.trim(), manager: kept ? null : manager.displayName, managerId: kept ? null : manager.id });
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

  return run.admins.flatMap((admin) => {
    const user = done.get(`user:${admin.key}`);
    const privileged = done.get(`priv:${admin.key}`);
    return user && privileged ? [{ key: admin.key, user, privileged }] : [];
  });
}
