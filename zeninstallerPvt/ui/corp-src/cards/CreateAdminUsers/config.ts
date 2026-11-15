/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { EntraLicence } from "../../api/azureGraph";
import { GROUPS_SCOPES, ORGANIZATION_SCOPES, ROLE_MANAGEMENT_SCOPES, USER_SCOPES } from "../../config/azureConfig";

export const CREATE_ADMIN_USERS_TITLE = "Create admin users";

export const ADMIN_USERS_SCOPES = [...GROUPS_SCOPES, ...USER_SCOPES, ...ROLE_MANAGEMENT_SCOPES, ...ORGANIZATION_SCOPES];

export type GroupRole = { directoryRole: "Global Administrator" } | { azureRole: "Owner"; scope: "root" | "subscription" };

export type AdminGroup = {
  name: string;
  description: string;
  memberOf: string[]; // Parent groups.
  roleAssignable?: boolean; // Fixed at creation, and needed to hold a directory role.
  roles: GroupRole[];
};

export const PRIVILEGED_GROUP = "PrivilegedAccounts";

// The groups, nesting and roles the GlobalGroups (c02) Terraform stage used to create; parents come before their members.
export const ADMIN_GROUPS: AdminGroup[] = [
  { name: "PawUsers", description: "Signs in to the PAW desktop", memberOf: [], roles: [] },
  {
    name: PRIVILEGED_GROUP,
    description: "All enabled privileged accounts",
    memberOf: ["PawUsers"],
    roleAssignable: true,
    roles: [{ directoryRole: "Global Administrator" }, { azureRole: "Owner", scope: "root" }],
  },
  { name: "DbAdmin-Dev", description: "DB admins for Dev environments", memberOf: [], roles: [] },
  { name: "DbAdmin-Test", description: "DB admins for Test environments", memberOf: [], roles: [] },
  { name: "DbAdmin-Prod", description: "DB admins for Prod environments", memberOf: [], roles: [] },
  {
    name: "ResourceGroupDeployer",
    description:
      "This group should be assigned as owner of the subscription and should be added as member of all administration groups that are required to deploy resources in the environment",
    memberOf: ["DbAdmin-Dev", "DbAdmin-Test", "DbAdmin-Prod"],
    roles: [{ azureRole: "Owner", scope: "subscription" }],
  },
  {
    name: "LeadDeveloper",
    description: "This group is used to assign environment administration permissions to lead developers.",
    memberOf: ["ResourceGroupDeployer"],
    roles: [],
  },
];

export const DEFAULT_PRIVILEGED_GROUPS = [PRIVILEGED_GROUP];

export function roleLabel(role: GroupRole): string {
  if ("directoryRole" in role) return role.directoryRole;
  return `${role.azureRole} on the ${role.scope === "root" ? "tenant root management group" : "subscription"}`;
}

// Who holds PrivilegedAccounts' Global Administrator: each adm_ account, or the group itself (role-assignable, so P1).
export type RoleTarget = "users" | "group";
export type LicenceState = EntraLicence | "unknown" | null; // Null while checking; "unknown" when it couldn't be read.

export const ROLE_TARGETS: { target: RoleTarget; label: string; description: string; needs: EntraLicence }[] = [
  {
    target: "users",
    label: "Assign directly to users",
    description: "Global Administrator goes on each adm_ account. PrivilegedAccounts is a normal group, so removing someone from it doesn't remove their Global Administrator.",
    needs: "none",
  },
  {
    target: "group",
    label: "Assign to the group",
    description: "PrivilegedAccounts is role-assignable, so membership decides who's Global Administrator.",
    needs: "p1",
  },
];

export const PIM_OPTION = {
  label: "Use PIM",
  description: "Eligible instead of active. Global Administrator and Owner on the tenant root management group are activated when needed, with a reason and a time limit.",
  needs: "p2" as EntraLicence,
};

export const LICENCE_LABEL: Record<EntraLicence, string> = { none: "No licence", p1: "Entra ID P1", p2: "Entra ID P2" };
const LICENCE_RANK: Record<EntraLicence, number> = { none: 0, p1: 1, p2: 2 };

// Nothing is allowed until the licence is read.
export function licenceAllows(needs: EntraLicence, licence: LicenceState): boolean {
  return licence !== null && licence !== "unknown" && LICENCE_RANK[licence] >= LICENCE_RANK[needs];
}

// The target and PIM only change PrivilegedAccounts' roles.
export function groupRoleLabel(group: AdminGroup, role: GroupRole, target: RoleTarget, pim: boolean): string {
  const label = roleLabel(role);
  if (group.name !== PRIVILEGED_GROUP) return label;
  const notes = [target === "users" && "directoryRole" in role && "on each member account", pim && "eligible through PIM"].filter(Boolean);
  return notes.length ? `${label} (${notes.join(", ")})` : label;
}
