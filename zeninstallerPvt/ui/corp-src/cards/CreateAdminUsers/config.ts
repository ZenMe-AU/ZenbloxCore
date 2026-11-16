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

export const ADMIN_GROUPS: AdminGroup[] = [
  { name: "PawUsers", description: "Signs in to the PAW desktop", memberOf: [], roles: [] },
  { name: "PrivilegedAccountApproved", description: "This group indicates that user has been approved to have a privileged account. This approval will be renewed during access review sessions that are run every 6 months.", memberOf: [], roles: [] },
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

export const USER_ACCOUNT_GROUPS = ["PrivilegedAccountApproved"];
export const PRIVILEGED_ACCOUNT_GROUPS = [PRIVILEGED_GROUP];

export function roleLabel(role: GroupRole): string {
  if ("directoryRole" in role) return role.directoryRole;
  return `${role.azureRole} on the ${role.scope === "root" ? "tenant root management group" : "subscription"}`;
}

// Who holds PrivilegedAccounts' Global Administrator: each adm_ account, or the group itself (role-assignable, so P1).
export type RoleTarget = "users" | "group";
export type LicenceState = EntraLicence | "unknown" | null; // Null while checking; "unknown" when it couldn't be read.

export const PIM_OPTION = {
  label: "Require PIM for all privileged accounts",
  description: "When assigning roles, set them as PIM Eligible instead of active. User must activate their roles when needed, with a reason and a time limit.",
  needs: "p2" as EntraLicence,
};

export const LICENCE_LABEL: Record<EntraLicence, string> = { none: "No Entra ID licence available", p1: "Entra ID P1 license available", p2: "Entra ID P2 license available" };
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
