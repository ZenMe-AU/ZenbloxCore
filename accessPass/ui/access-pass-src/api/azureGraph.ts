import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "./msal";
import { GRAPH_SCOPES, ARM_SCOPES } from "../config/azureConfig";
import { RBAC_ROLE_IDS } from "../config/azureConfig";
import { deterministicUuid } from "../../access-pass-src/logic/crypto";

const GRAPH = "https://graph.microsoft.com/v1.0";
const ARM = "https://management.azure.com";

// ── Token helpers ──────────────────────────────────────────────────────────────

export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"; // Microsoft consumer tenant (MSA accounts)

// overrideTenantId is used for MSA accounts to target a specific AAD tenant
// for BOTH Graph and ARM calls (MSA consumer directory doesn't support app management)
async function getToken(account: AccountInfo, scopes: string[], overrideTenantId?: string): Promise<string> {
  const msal = await getMsal();
  if (!msal) throw new Error("MSAL not configured");

  const isArm = scopes.some((s) => s.includes("management.azure.com"));
  if (isArm && account.tenantId === MSA_TENANT && !overrideTenantId) {
    throw new Error("MSA_NEEDS_TENANT");
  }

  // Always use tenant-specific authority to avoid consumer token issues.
  // overrideTenantId takes precedence; otherwise use the account's own tenantId,
  // but skip authority override for MSA consumer tenant (it has no managed directory).
  const tenant = overrideTenantId ?? account.tenantId;
  const authority = tenant !== MSA_TENANT ? `https://login.microsoftonline.com/${tenant}` : undefined;

  const res = await msal.acquireTokenSilent({
    scopes,
    account,
    ...(authority ? { authority } : {}),
  });
  return res.accessToken;
}

async function gFetch(token: string, base: string, path: string, options?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

export type Subscription = { id: string; displayName: string };

export async function listSubscriptions(account: AccountInfo, overrideTenantId?: string): Promise<Subscription[]> {
  await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const data = await gFetch(token, ARM, "/subscriptions?api-version=2020-01-01");
  return (data.value ?? []).map((s: { subscriptionId: string; displayName: string }) => ({
    id: s.subscriptionId,
    displayName: s.displayName,
  }));
}

// ── App registration ───────────────────────────────────────────────────────────

export async function getExistingApp(
  account: AccountInfo,
  displayName: string,
  overrideTenantId?: string,
): Promise<{ appId: string; id: string } | null> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/applications?$filter=displayName eq '${displayName}'&$select=appId,id`);
  return data.value?.[0] ? { appId: data.value[0].appId, id: data.value[0].id } : null;
}

/** Reverse lookup: resolve an app registration's display name from its client (app) id. */
export async function getAppNameByAppId(account: AccountInfo, appId: string, overrideTenantId?: string): Promise<string | null> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/applications?$filter=appId eq '${appId}'&$select=displayName`);
  return data.value?.[0]?.displayName ?? null;
}

export async function createAppRegistration(
  account: AccountInfo,
  displayName: string,
  permissions: readonly string[],
  overrideTenantId?: string,
): Promise<{ appId: string; id: string }> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, "/applications", {
    method: "POST",
    body: JSON.stringify({
      displayName,
      signInAudience: "AzureADMyOrg",
      requiredResourceAccess: [
        {
          resourceAppId: "00000003-0000-0000-c000-000000000000",
          resourceAccess: permissions.map((id) => ({ id, type: "Role" })),
        },
      ],
    }),
  });
  return { appId: data.appId, id: data.id };
}

// ── Service principal ──────────────────────────────────────────────────────────

export async function getExistingSP(account: AccountInfo, appId: string, overrideTenantId?: string): Promise<{ id: string } | null> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/servicePrincipals?$filter=appId eq '${appId}'&$select=id`);
  return data.value?.[0] ? { id: data.value[0].id } : null;
}

export async function createServicePrincipal(account: AccountInfo, appId: string, overrideTenantId?: string): Promise<{ id: string }> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const res = await fetch(`${GRAPH}/servicePrincipals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ appId }),
  });
  if (res.status === 409) {
    // SP already exists — fetch it
    const existing = await getExistingSP(account, appId, overrideTenantId);
    if (existing) return existing;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} /servicePrincipals: ${body}`);
  }
  const data = await res.json();
  return { id: data.id };
}

// ── Federated credentials ──────────────────────────────────────────────────────

export async function ensureFederatedCredential(
  account: AccountInfo,
  appObjectId: string,
  org: string,
  repo: string,
  environment: string,
  overrideTenantId?: string,
): Promise<void> {
  const subject = `repo:${org}/${repo}:environment:${environment}`;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const base = `${slug(org)}-${slug(repo)}-${slug(environment)}`;
  const credName = base.length <= 113 ? `github-${base}` : base.slice(0, 120);
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const existing = await gFetch(token, GRAPH, `/applications/${appObjectId}/federatedIdentityCredentials`);
  if (existing?.value?.some((c: { subject: string }) => c.subject === subject)) return;
  await gFetch(token, GRAPH, `/applications/${appObjectId}/federatedIdentityCredentials`, {
    method: "POST",
    body: JSON.stringify({
      name: credName,
      issuer: "https://token.actions.githubusercontent.com",
      subject,
      audiences: ["api://AzureADTokenExchange"],
    }),
  });
}

// ── RBAC roles (ARM) ──────────────────────────────────────────────────────────

export async function ensureRbacRole(
  account: AccountInfo,
  subscriptionId: string,
  spObjectId: string,
  roleName: string,
  overrideTenantId?: string,
): Promise<void> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const scope = `/subscriptions/${subscriptionId}`;
  const roleId = RBAC_ROLE_IDS[roleName];

  const existing = await gFetch(
    token,
    ARM,
    `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${spObjectId}')`,
  );
  const alreadyAssigned = existing?.value?.some((a: { properties: { roleDefinitionId: string } }) =>
    a.properties.roleDefinitionId.toLowerCase().endsWith(roleId.toLowerCase()),
  );
  if (alreadyAssigned) return;

  const assignmentName = await deterministicUuid(scope, roleId, spObjectId);
  await gFetch(token, ARM, `${scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
        principalId: spObjectId,
        principalType: "ServicePrincipal",
      },
    }),
  });
}

// ── Admin consent ──────────────────────────────────────────────────────────────

export async function grantAdminConsent(
  account: AccountInfo,
  spObjectId: string,
  permissions: readonly string[],
  overrideTenantId?: string,
): Promise<void> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);

  const graphSP = await gFetch(token, GRAPH, "/servicePrincipals?$filter=appId eq '00000003-0000-0000-c000-000000000000'&$select=id");
  const graphSpId = graphSP?.value?.[0]?.id;
  if (!graphSpId) throw new Error("Microsoft Graph service principal not found in tenant");

  for (const permId of permissions) {
    await gFetch(token, GRAPH, `/servicePrincipals/${spObjectId}/appRoleAssignments`, {
      method: "POST",
      body: JSON.stringify({ principalId: spObjectId, resourceId: graphSpId, appRoleId: permId }),
    }).catch((err: Error) => {
      if (!err.message.includes("already exists") && !err.message.includes("409")) throw err;
    });
  }
}

// ── Revoke delegated permission grants ────────────────────────────────────────

export async function revokeOAuth2Grants(account: AccountInfo, appClientId: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const spRes = await gFetch(token, GRAPH, `/servicePrincipals?$filter=appId eq '${appClientId}'&$select=id`);
  const spId: string | undefined = spRes?.value?.[0]?.id;
  if (!spId) return;
  const grantsRes = await gFetch(token, GRAPH, `/oauth2PermissionGrants?$filter=clientId eq '${spId}'`);
  const ids: string[] = (grantsRes?.value ?? []).map((g: { id: string }) => g.id);
  await Promise.all(ids.map((id) => gFetch(token, GRAPH, `/oauth2PermissionGrants/${id}`, { method: "DELETE" }).catch(() => {})));
}
