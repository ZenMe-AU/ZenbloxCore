import type { StageDefinition } from "../types";

// ── App registration client ID (ZenInstaller SPA) ─────────────────────────────

export const AZURE_CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;

// ── OAuth scopes ───────────────────────────────────────────────────────────────

export const GRAPH_SCOPES = [
  "https://graph.microsoft.com/Application.ReadWrite.All",
  "https://graph.microsoft.com/AppRoleAssignment.ReadWrite.All",
  "https://graph.microsoft.com/DelegatedPermissionGrant.ReadWrite.All",
  "https://graph.microsoft.com/RoleManagement.ReadWrite.Directory",
  "https://graph.microsoft.com/User.ReadWrite.All",
  "https://graph.microsoft.com/User-PasswordProfile.ReadWrite.All",
  "https://graph.microsoft.com/Group.ReadWrite.All",
  "https://graph.microsoft.com/GroupMember.ReadWrite.All",
  "https://graph.microsoft.com/UserAuthenticationMethod.ReadWrite.All",
  "https://graph.microsoft.com/Policy.ReadWrite.AuthenticationMethod",
  "openid",
  "profile",
];

export const ARM_SCOPES = ["https://management.azure.com/user_impersonation"];

// ── Individual Graph application permissions ───────────────────────────────────

export const GRAPH_PERMISSIONS = {
  GroupReadWriteAll: "62a82d76-70ea-41e2-9197-370581804d09",
  GroupMemberReadWriteAll: "dbaae8cf-10b5-4b86-a4a1-f871c94c6695",
  UserReadWriteAll: "741f803b-c850-494e-b5df-cde7c675a1ca",
  ApplicationReadWriteAll: "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9",
  AppRoleAssignmentReadWriteAll: "06b708a9-e830-4db3-a914-8e69da51d44f",
  RoleManagementReadWriteDirectory: "9e3f62cf-ca93-4989-b6ce-bf83c28f9fe8",
  UserAuthenticationMethodReadWriteAll: "50483e42-d915-4231-9639-7fdb7fd190e5",
  PolicyReadWriteAuthenticationMethod: "29c18626-4985-4dcd-85c0-193eef327366",
  PrivilegedAccessReadWriteAzureADGroup: "2f6817f8-7b12-4f0f-bc18-eeaf60705a9e",
  PolicyReadWriteApplicationConfiguration: "be74164b-cff1-491c-8741-e671cb536e13",
  DomainReadWriteAll: "7e05723c-0bb0-42da-be95-ae9f08a6e53c",
} as const;

export type GraphPermissionKey = keyof typeof GRAPH_PERMISSIONS;

// ── RBAC built-in role IDs ─────────────────────────────────────────────────────

export const RBAC_ROLE_IDS: Record<string, string> = {
  Contributor: "b24988ac-6180-42a0-ab88-20f7382dd24c",
  "User Access Administrator": "18d7d88d-d35e-4fb5-a5c3-7773c20a72d9",
};

// ── Aggregate helpers ─────────────────────────────────────────────────────────

export function getAllPermissions(stages: Pick<StageDefinition, "azurePermissions">[]): string[] {
  return [...new Set(stages.flatMap((s) => s.azurePermissions ?? []))];
}
