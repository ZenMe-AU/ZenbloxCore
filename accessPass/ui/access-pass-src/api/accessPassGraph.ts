import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "./accessPassMsal";
import { GRAPH_SCOPES, ARM_SCOPES } from "../config/accessPassConfig";
import { RBAC_ROLE_IDS } from "../config/accessPassConfig";
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

export type EntraUser = {
  id: string;
  displayName: string;
  userPrincipalName: string;
};

export type TemporaryAccessPass = {
  id: string;
  temporaryAccessPass: string;
  startDateTime?: string;
  lifetimeInMinutes?: number;
  isUsableOnce?: boolean;
};

type GraphGroup = {
  id: string;
  displayName?: string;
};

type GraphAuthMethod = {
  id: string;
  "@odata.type"?: string;
};

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

function pickRandomChar(chars: string): string {
  return chars[randomInt(chars.length)];
}

function shuffleString(input: string): string {
  const out = input.split("");
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out.join("");
}

export function generateRandomPassword(length = 30): string {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()-_=+[]{}<>?";
  const all = `${lowercase}${uppercase}${digits}${symbols}`;

  const effectiveLength = Math.max(length, 4);
  const chars: string[] = [pickRandomChar(lowercase), pickRandomChar(uppercase), pickRandomChar(digits), pickRandomChar(symbols)];

  for (let i = chars.length; i < effectiveLength; i += 1) {
    chars.push(pickRandomChar(all));
  }

  return shuffleString(chars.join(""));
}

function getAuthMethodDeletePath(userId: string, method: GraphAuthMethod): string | null {
  const methodType = method["@odata.type"]?.toLowerCase();

  // Password auth method cannot be deleted; it is rotated separately via passwordProfile.
  if (methodType?.includes("passwordauthenticationmethod")) return null;

  if (methodType?.includes("emailauthenticationmethod")) {
    return `/users/${userId}/authentication/emailMethods/${method.id}`;
  }
  if (methodType?.includes("phoneauthenticationmethod")) {
    return `/users/${userId}/authentication/phoneMethods/${method.id}`;
  }
  if (methodType?.includes("microsoftauthenticatorauthenticationmethod")) {
    return `/users/${userId}/authentication/microsoftAuthenticatorMethods/${method.id}`;
  }
  if (methodType?.includes("fido2authenticationmethod")) {
    return `/users/${userId}/authentication/fido2Methods/${method.id}`;
  }
  if (methodType?.includes("softwareoathauthenticationmethod")) {
    return `/users/${userId}/authentication/softwareOathMethods/${method.id}`;
  }
  if (methodType?.includes("windowshelloforbusinessauthenticationmethod")) {
    return `/users/${userId}/authentication/windowsHelloForBusinessMethods/${method.id}`;
  }
  if (methodType?.includes("temporaryaccesspassauthenticationmethod")) {
    return `/users/${userId}/authentication/temporaryAccessPassMethods/${method.id}`;
  }

  // Unknown or unsupported method type: skip instead of failing the full flow.
  return null;
}

export async function listSubscriptions(account: AccountInfo, overrideTenantId?: string): Promise<Subscription[]> {
  await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const data = await gFetch(token, ARM, "/subscriptions?api-version=2020-01-01");
  return (data.value ?? []).map((s: { subscriptionId: string; displayName: string }) => ({
    id: s.subscriptionId,
    displayName: s.displayName,
  }));
}

// list Entra users managed by the signed-in user (direct reports)
export async function listUsersManagedBySignedInUser(account: AccountInfo, overrideTenantId?: string): Promise<EntraUser[]> {
  // Query direct reports so the dropdown shows users who have the signed-in user as manager.
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);

  const users = await gFetch(token, GRAPH, "/me/directReports/microsoft.graph.user?$select=id,displayName,userPrincipalName");

  return (
    (users.value ?? [])
      // Ensure each option has user-friendly text even when optional fields are missing.
      .map((u: { id: string; displayName?: string; userPrincipalName?: string; mail?: string }) => ({
        id: u.id,
        displayName: u.displayName ?? u.userPrincipalName ?? u.mail ?? u.id,
        userPrincipalName: u.userPrincipalName ?? u.mail ?? "",
      }))
      .sort((a: EntraUser, b: EntraUser) => a.displayName.localeCompare(b.displayName))
  );
}

// fetches the signed-in user's object ID from Microsoft Graph /me endpoint
export async function getSignedInUserObjectId(account: AccountInfo, overrideTenantId?: string): Promise<string> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const me = await gFetch(token, GRAPH, "/me?$select=id");
  const userId = me?.id as string | undefined;
  if (!userId) {
    throw new Error("Unable to resolve signed-in user object ID from Graph /me");
  }
  return userId;
}

export async function addUserToGroupByDisplayName(account: AccountInfo, userId: string, groupDisplayName: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const escapedName = groupDisplayName.replace(/'/g, "''");
  const filter = encodeURIComponent(`displayName eq '${escapedName}'`);
  const groups = await gFetch(token, GRAPH, `/groups?$filter=${filter}&$select=id,displayName&$top=1`);
  const group = (groups?.value?.[0] ?? null) as GraphGroup | null;

  if (!group?.id) {
    throw new Error(`Group '${groupDisplayName}' not found`);
  }

  const res = await fetch(`${GRAPH}/groups/${group.id}/members/$ref`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "@odata.id": `${GRAPH}/directoryObjects/${userId}`,
    }),
  });

  if (res.ok || res.status === 204) return;

  const body = await res.text().catch(() => "");
  const lower = body.toLowerCase();
  const alreadyMember =
    (res.status === 400 || res.status === 409) &&
    (lower.includes("already exist") || lower.includes("added object references already exist") || lower.includes("object references already exist"));

  if (alreadyMember) return;

  throw new Error(`${res.status} /groups/${group.id}/members/$ref: ${body}`);
}

// create a temporary access pass for a given user (requires Graph permission: UserAuthenticationMethod.ReadWrite.All)
export async function createTemporaryAccessPassForUser(account: AccountInfo, userId: string, overrideTenantId?: string): Promise<TemporaryAccessPass> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const maxAttempts = 4;
  let data: {
    id: string;
    temporaryAccessPass: string;
    startDateTime?: string;
    lifetimeInMinutes?: number;
    isUsableOnce?: boolean;
  } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      data = await gFetch(token, GRAPH, `/users/${userId}/authentication/temporaryAccessPassMethods`, {
        method: "POST",
        body: JSON.stringify({
          isUsableOnce: true,
          lifetimeInMinutes: 60,
        }),
      });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const retryable = msg.includes("409") && (msg.toLowerCase().includes("conflict") || msg.includes("concurrent requests"));

      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      const delayMs = 400 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (!data) {
    throw new Error("Failed to create Temporary Access Pass");
  }

  return {
    id: data.id,
    temporaryAccessPass: data.temporaryAccessPass,
    startDateTime: data.startDateTime,
    lifetimeInMinutes: data.lifetimeInMinutes,
    isUsableOnce: data.isUsableOnce,
  };
}

export async function removeNonPasswordAuthenticationMethods(account: AccountInfo, userId: string, overrideTenantId?: string): Promise<number> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  // Do not use @odata.type in $select; Graph rejects it in select/expand expressions.
  const data = await gFetch(token, GRAPH, `/users/${userId}/authentication/methods`);
  const methods = (data?.value ?? []) as GraphAuthMethod[];

  const deletePaths = methods.map((m) => getAuthMethodDeletePath(userId, m)).filter((p): p is string => !!p);

  for (const path of deletePaths) {
    await gFetch(token, GRAPH, path, { method: "DELETE" });
  }

  return deletePaths.length;
}

export async function resetUserPassword(account: AccountInfo, userId: string, newPassword: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await gFetch(token, GRAPH, `/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          passwordProfile: {
            password: newPassword,
            forceChangePasswordNextSignIn: false,
            forceChangePasswordNextSignInWithMfa: false,
          },
        }),
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const retryable = msg.includes("409") && (msg.includes("Directory_ConcurrencyViolation") || msg.includes("concurrent requests"));

      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      const delayMs = 400 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// checks if a temporary access pass method exists for a given user and method ID
export async function temporaryAccessPassMethodExists(account: AccountInfo, userId: string, methodId: string, overrideTenantId?: string): Promise<boolean> {
  try {
    const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
    await gFetch(token, GRAPH, `/users/${userId}/authentication/temporaryAccessPassMethods/${methodId}?$select=id`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404")) return false;
    throw err;
  }
}

// ── App registration ───────────────────────────────────────────────────────────

export async function getExistingApp(account: AccountInfo, displayName: string, overrideTenantId?: string): Promise<{ appId: string; id: string } | null> {
  const token = await getToken(account, GRAPH_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/applications?$filter=displayName eq '${displayName}'&$select=appId,id`);
  return data.value?.[0] ? { appId: data.value[0].appId, id: data.value[0].id } : null;
}

export async function createAppRegistration(
  account: AccountInfo,
  displayName: string,
  permissions: readonly string[],
  overrideTenantId?: string
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
  overrideTenantId?: string
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
  overrideTenantId?: string
): Promise<void> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const scope = `/subscriptions/${subscriptionId}`;
  const roleId = RBAC_ROLE_IDS[roleName];

  const existing = await gFetch(
    token,
    ARM,
    `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${spObjectId}')`
  );
  const alreadyAssigned = existing?.value?.some((a: { properties: { roleDefinitionId: string } }) =>
    a.properties.roleDefinitionId.toLowerCase().endsWith(roleId.toLowerCase())
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

export async function grantAdminConsent(account: AccountInfo, spObjectId: string, permissions: readonly string[], overrideTenantId?: string): Promise<void> {
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
