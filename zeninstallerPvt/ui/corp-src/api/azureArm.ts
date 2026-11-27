/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getToken } from "../auth/msal";
import { azFetch as gFetch, ARM } from "./azureFetch";
import { ARM_SCOPES, BACKEND_VERSION_KEYS, RBAC_ROLE_IDS } from "../config/azureConfig";
import { deterministicUuid } from "../logic/crypto";
import { createRandomUuid } from "../logic/randomUuid";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import { MissingAccessError } from "../logic/azureAccess";
import type { AzureAccount, RoleAssignment } from "../types";
import { findListedResource } from "./azureArmHelper";

// ── Function App code deployment ──────────────────────────────────────────────

function appSettingsPath(subscriptionId: string, resourceGroup: string, name: string) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}/config/appsettings`;
}

export async function readFunctionAppSettings(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  overrideTenantId?: string
): Promise<Record<string, string>> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `${appSettingsPath(subscriptionId, resourceGroup, name)}/list?api-version=${WEB_API}`;
  return (await gFetch(token, ARM, path, { method: "POST" }))?.properties ?? {};
}

export async function updateFunctionAppSettings(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  settings: Record<string, string>,
  overrideTenantId?: string
): Promise<void> {
  const current = await readFunctionAppSettings(account, subscriptionId, resourceGroup, name, overrideTenantId);
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  await gFetch(token, ARM, `${appSettingsPath(subscriptionId, resourceGroup, name)}?api-version=${WEB_API}`, {
    method: "PUT",
    body: JSON.stringify({ properties: { ...current, ...settings } }),
  });
}

export type DeployedBackend = {
  version: string;
  sha: string;
  builtAt: number;
  deployedAt: number | null;
};

const DEPLOY_TIMEOUT_MS = 600_000;

/*
 * The deployment history, which is where the verdict is read from. extensions/onedeploy also answers
 * but its 200 has no documented schema and nothing to read until a one-deploy has happened; this one
 * returns a defined Deployment: status 4 succeeded, 3 failed, end_time when it went live.
 */
async function latestDeployment(
  token: string,
  subscriptionId: string,
  resourceGroup: string,
  name: string
): Promise<{ status?: number; message?: string; end_time?: string } | null> {
  const res = await fetch(
    `${ARM}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}/deployments?api-version=${WEB_API}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  const text = await res.text();
  const markup = text.search(/<!DOCTYPE|<html/i);
  let items: { properties?: { status?: number; message?: string; end_time?: string } }[] = [];
  try {
    items = JSON.parse(markup === -1 ? text : text.slice(0, markup))?.value ?? [];
  } catch {
    return null;
  }
  return (
    items
      .map((d) => d.properties ?? {})
      .sort((a: { end_time?: string }, b: { end_time?: string }) => Date.parse(b.end_time ?? "") - Date.parse(a.end_time ?? "") || 0)[0] ?? null
  );
}

export async function fetchDeployedBackend(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  overrideTenantId?: string
): Promise<DeployedBackend | null> {
  const settings = await readFunctionAppSettings(account, subscriptionId, resourceGroup, name, overrideTenantId);
  const version = settings[BACKEND_VERSION_KEYS.version];
  if (!version) return null;

  const token = await getToken(account, ARM_SCOPES, overrideTenantId);

  let deployedAt: number | null = null;
  const ms = Date.parse((await latestDeployment(token, subscriptionId, resourceGroup, name))?.end_time ?? "");
  if (!Number.isNaN(ms)) deployedAt = Math.floor(ms / 1000);
  return {
    version,
    sha: settings[BACKEND_VERSION_KEYS.sha] ?? "",
    builtAt: Number(settings[BACKEND_VERSION_KEYS.builtAt]) || 0,
    deployedAt,
  };
}

export async function deployZipToFunctionApp(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  appName: string,
  zip: Blob,
  overrideTenantId?: string,
  onProgress?: (phase: "uploading" | "deploying") => void
): Promise<void> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);

  onProgress?.("uploading");
  const res = await fetch(`https://${appName}.scm.azurewebsites.net/api/publish?type=zip`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/zip" },
    body: zip,
  });
  if (!res.ok) {
    throw new Error(`Deploying the package failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  // One-deploy returns as soon as the package is accepted; the unpack happens afterwards.
  onProgress?.("deploying");
  const startedAt = Date.now();
  const deadline = startedAt + DEPLOY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const latest = await latestDeployment(token, subscriptionId, resourceGroup, appName);
    // Older entries are still listed, so only one that finished after the upload is this deployment.
    if (latest?.end_time && Date.parse(latest.end_time) >= startedAt) {
      if (latest.status === 3) throw new Error(`Deployment failed: ${latest.message || "unknown"}`);
      if (latest.status === 4) return;
    }
  }
  throw new Error(`Deployment did not finish within ${DEPLOY_TIMEOUT_MS / 60_000} minutes`);
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

// ArmResource and armGet can move to azureArmHelper.ts later.
type ArmResource = {
  id?: string;
  identity?: { principalId?: string };
  properties?: {
    provisioningState?: string;
    nameServers?: string[];
    TXTRecords?: { value: string[] }[];
  };
};

// GET that treats 404 as null instead of throwing.
async function armGet(token: string, path: string): Promise<ArmResource | null> {
  try {
    return await gFetch(token, ARM, path);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("404")) return null;
    throw err;
  }
}

// Polls fetchState until it returns "Succeeded". Throws on "Failed"/"Canceled" or timeout.
async function pollProvisioning(fetchState: () => Promise<string | undefined>, resourceLabel: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const state = await fetchState();
    if (state === "Succeeded") return;
    if (state === "Failed" || state === "Canceled") throw new Error(`${resourceLabel} provisioning ${state}`);
    if (Date.now() - start > timeoutMs) throw new Error(`${resourceLabel} provisioning timed out`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export type EnsureResult = "created" | "exists";

// ── Resource providers ─────────────────────────────────────────────────────────

const PROVIDER_API = "2021-04-01";

export type ProviderRegistrationState = "Registered" | "Registering" | "NotRegistered" | "Unregistered" | "Unknown";

// Current registration state of a resource provider namespace on the subscription.
export async function getProviderRegistrationState(
  account: AzureAccount,
  subscriptionId: string,
  namespace: string,
  overrideTenantId?: string
): Promise<ProviderRegistrationState> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const data = (await gFetch(token, ARM, `/subscriptions/${subscriptionId}/providers/${namespace}?api-version=${PROVIDER_API}`)) as {
    registrationState?: string;
  };
  return (data?.registrationState as ProviderRegistrationState) ?? "Unknown";
}

// Requests registration. Returns immediately — ARM completes it asynchronously.
export async function registerProvider(account: AzureAccount, subscriptionId: string, namespace: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  await gFetch(token, ARM, `/subscriptions/${subscriptionId}/providers/${namespace}/register?api-version=${PROVIDER_API}`, {
    method: "POST",
  });
}

// Which of these aren't registered, from one list call instead of one per namespace; one this cloud doesn't offer is skipped, as Terraform skips it.
export async function listUnregisteredProviders(
  account: AzureAccount, subscriptionId: string, namespaces: readonly string[], overrideTenantId?: string
): Promise<string[]> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const states = new Map<string, string | undefined>();
  for (let path: string | null = `/subscriptions/${subscriptionId}/providers?api-version=${PROVIDER_API}`; path;) {
    const page: { value: { namespace: string; registrationState?: string }[]; nextLink?: string } = await gFetch(token, ARM, path);
    page.value.forEach(({ namespace, registrationState }) => states.set(namespace.toLowerCase(), registrationState));
    const next = page.nextLink ? new URL(page.nextLink) : null;
    path = next && `${next.pathname}${next.search}`;
  }
  return namespaces.filter((namespace) => states.has(namespace.toLowerCase()) && states.get(namespace.toLowerCase()) !== "Registered");
}

// ── Locations ───────────────────────────────────────────────────────────────────

export type AzureLocation = { name: string; displayName: string };

// Lists physical Azure regions available to the subscription (excludes logical/paired regions).
export async function listLocations(account: AzureAccount, subscriptionId: string, overrideTenantId?: string): Promise<AzureLocation[]> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const data = await gFetch(token, ARM, `/subscriptions/${subscriptionId}/locations?api-version=2022-12-01`);
  const raw: { name: string; displayName: string; metadata?: { regionType?: string } }[] = data?.value ?? [];
  return raw
    .filter((l) => l.metadata?.regionType === "Physical")
    .map((l) => ({ name: l.name, displayName: l.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ── Resource group ─────────────────────────────────────────────────────────────

function resourceGroupPath(subscriptionId: string, name: string): string {
  return `/subscriptions/${subscriptionId}/resourcegroups/${name}?api-version=2021-04-01`;
}

export async function ensureResourceGroup(
  account: AzureAccount,
  subscriptionId: string,
  name: string,
  location: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = resourceGroupPath(subscriptionId, name);
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({ location }) });
  return "created";
}

// Read-only existence check — used by live "is infra still operable" checks (no create-on-miss).
export async function resourceGroupExists(account: AzureAccount, subscriptionId: string, name: string, overrideTenantId?: string): Promise<boolean> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  return !!(await armGet(token, resourceGroupPath(subscriptionId, name)));
}

// ── Azure Access Checks ─────────────────────────────────────────────────────────────

// Deprecated: Replaced by CardResourceAccessRequest and ArmRole in types.ts; kept for reference.
// // One resource a card needs: children sit under it and use its api, alongside sits in the same resource group.
// export type ResourceAccess = {
//   type: string;
//   api: string; // ARM api-version for this type
//   name: string;
//   actions: readonly string[];
//   locate?: boolean; // checked in the group Azure already has it in, else the card's resource group
//   mustExist?: boolean;
//   whenCreating?: readonly string[]; // subscription actions needed only while it doesn't exist
//   children?: readonly { path: string; actions: readonly string[]; probe?: false }[];
//   alongside?: readonly { type: string; api: string; name: string; actions: readonly string[] }[];
// };

// Deprecated: Replaced by CardResourceAccessRequest and ArmRole in types.ts; kept for reference.
// // The card decides what it needs; this layer only works out where each action is checked.
// export type CardResourceAccessRequest = {
//   subscription?: readonly string[];
//   tenantRoot?: readonly string[];
//   resourceGroup?: string;
//   createGroup?: { providers: readonly string[]; actions?: readonly string[] }; // actions sit at the group, or the subscription before it exists
//   resources?: readonly ResourceAccess[];
// };

// Deprecated: Replaced by CardResourceAccessRequest and ArmRole in types.ts; kept for reference.
// // Shared state for one card access check: existence probes are cached, requirements accumulate in order.
// type CardAccessCheck = {
//   account: AzureAccount;
//   subscriptionId: string;
//   overrideTenantId?: string;
//   group: string;
//   sub: string;
//   token: string;
//   existence: Map<string, boolean>;
//   requirements: ManagementAccessRequirement[];
// };

// Deprecated: Moved to hooks/util/useAzureAccessCheck.ts; kept for reference.
// // Missing resources are checked at their existing parent; missing groups need subscription access.
// export async function ensureCardResourceAccess(
//   account: AzureAccount, subscriptionId: string, request: CardAccessRequest, overrideTenantId?: string
// ): Promise<void> {
//   const check: AccessCheck = { account, subscriptionId, overrideTenantId, sub: subscriptionScope(subscriptionId), lookups: new Map(), requirements: [] };
//   // Requirements per principal: "" is the signed-in user, else an Entra object id.
//   const byPrincipal = new Map([["", check.requirements]]);
//   await requireProviders(check, request.resourceProviders);
//   for (const { scope, objectId = "", actions, dataActions, createActions } of request.armRoles.flatMap(withChildren)) {
//     check.requirements = byPrincipal.get(objectId) ?? [];
//     byPrincipal.set(objectId, check.requirements);
//     const at = await resolveScope(check, scope);
//     check.requirements.push({ scope: at, actions, dataActions });
//     if (createActions && typeof scope !== "string" && !at.endsWith(`/providers/${scope.resource}`)) check.requirements.push({ scope: check.sub, actions: createActions });
//   }
//   for (const [objectId, requirements] of byPrincipal) {
//     await ensureManagementAccess(account, requirements, overrideTenantId, (scope) => permissionsAt(check, scope, objectId), objectId
//       ? `Principal ${objectId} needs these. Assign it a role that includes them at the listed scopes in Access control (IAM), then recheck.`
//       : undefined);
//   }
// }

// Deprecated: Moved to hooks/util/useAzureAccessCheck.ts; kept for reference.
// async function requireProviders(check: AccessCheck, providers: readonly string[]): Promise<void> {
//   if (!providers.length) return;
//   check.requirements.push({ scope: check.sub, actions: ["Microsoft.Resources/subscriptions/providers/read"] });
//   for (const namespace of providers) {
//     if (await getProviderRegistrationState(check.account, check.subscriptionId, namespace, check.overrideTenantId) !== "Registered") {
//       check.requirements.push({ scope: check.sub, actions: [`${namespace}/register/action`] });
//     }
//   }
// }

// Checks only the signed-in caller's subscription-level resource-group creation action.
export async function ensureResourceGroupCreationAccess(account: AzureAccount, subscriptionId: string, overrideTenantId?: string): Promise<void> {
  const guidance = `You need Contributor access (or equivalent permissions such as Owner) on the selected subscription ${subscriptionId} to create resource groups.
      Access to an individual resource group is not sufficient. Ask a subscription administrator to grant access in IAM
      or activate your eligible role in PIM at ${AZURE_PIM_ACTIVATION_URL} then retry.`;
  try {
    const permissions = await readPermissionsAtScope(account, subscriptionScope(subscriptionId), overrideTenantId);
    if (grantsArmAction(permissions, "Microsoft.Resources/subscriptions/resourceGroups/write")) return;
  } catch (err) {
    throw new Error(`Could not verify resource-group creation access. ${guidance} Details: ${err instanceof Error ? err.message : String(err)}`);
  }
  throw new Error(guidance);
}

// Replaced by ensureCardResourceAccess with azureSubscriptionAccess; kept for reference.
// // Checks the configured installer management actions at subscription scope, not literal role names.
// export async function ensureInstallerSubscriptionAccess(account: AzureAccount, subscriptionId: string, actions: readonly string[], overrideTenantId?: string): Promise<void> {
//   let permissions: ArmPermission[];
//   try {
//     permissions = await readPermissionsAtScope(account, subscriptionScope(subscriptionId), overrideTenantId);
//   } catch (err) {
//     throw new Error(`Could not verify installer subscription access. Details: ${err instanceof Error ? err.message : String(err)}`);
//   }
//   const missing = actions.filter((action) => !grantsArmAction(permissions, action));
//   if (missing.length) {
//     throw new Error(`Missing permissions:\n ${missing.join(", ")}`);
//   }
// }

function grantsArmAction(permissions: ArmPermission[], action: string, data = false): boolean {
  const matches = (pattern: string) =>
    new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i").test(action);
  // NotActions excludes actions from this grant only; another grant can still allow them.
  return permissions.some((permission) => data
    ? !!permission.dataActions?.some(matches) && !permission.notDataActions?.some(matches)
    : permission.actions.some(matches) && !permission.notActions?.some(matches));
}

export type ArmPermission = { actions: string[]; notActions?: string[]; dataActions?: string[]; notDataActions?: string[] };
export type ManagementAccessRequirement = { scope: string; actions: readonly string[]; dataActions?: readonly string[] };

// Reads the signed-in caller's management grants at a management group, subscription, group, or resource scope.
export async function readPermissionsAtScope(account: AzureAccount, scope: string, overrideTenantId?: string): Promise<ArmPermission[]> {
  if (!/^\/subscriptions\/[^/?#]+(?:\/resourceGroups\/[^/?#]+(?:\/providers\/[^?#]+)?)?$/i.test(scope) &&
      !/^\/providers\/Microsoft\.Management\/managementGroups\/[^/?#]+$/i.test(scope)) {
    throw new Error(`Invalid Azure management scope: ${scope}`);
  }
  // PIM activation/deactivation can leave the previously cached access token stale.
  const token = await getToken(account, ARM_SCOPES, overrideTenantId, true);
  const permissions: ArmPermission[] = [];
  const visited = new Set<string>();
  let path: string | null = `${scope}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`;
  while (path) {
    if (visited.has(path)) throw new Error("Azure returned a looping subscription permissions URL");
    visited.add(path);
    const page: { value: ArmPermission[]; nextLink?: string } = await gFetch(token, ARM, path, { cache: "no-store" });
    const strings = (list: unknown) => Array.isArray(list) && list.every((action) => typeof action === "string");
    if (!page || !Array.isArray(page.value) || page.value.some((permission) =>
      !permission || !strings(permission.actions) ||
      [permission.notActions, permission.dataActions, permission.notDataActions].some((list) => list !== undefined && !strings(list))
    )) throw new Error("Azure returned an invalid subscription permissions response");
    permissions.push(...page.value);
    if (page.nextLink) {
      const next = new URL(page.nextLink, ARM);
      if (next.origin !== ARM) throw new Error("Azure returned an unexpected subscription permissions URL");
      path = `${next.pathname}${next.search}`;
    } else {
      path = null;
    }
  }
  return permissions;
}

// Role assignments of a principal (by Entra object id, groups included) that assignedTo returns for a scope: at, above and below it.
export async function listRoleAssignments(token: string, objectId: string, scope: string): Promise<RoleAssignment[]> {
  const assignments: RoleAssignment[] = [];
  for (let path: string | null = `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${objectId}')`; path;) {
    const page: { value: { properties: RoleAssignment }[]; nextLink?: string } = await gFetch(token, ARM, path);
    assignments.push(...page.value.map(({ properties }) => properties));
    const next = page.nextLink ? new URL(page.nextLink) : null;
    path = next && `${next.pathname}${next.search}`;
  }
  return assignments;
}

// What a role definition grants.
export async function readRolePermissions(token: string, roleId: string): Promise<ArmPermission[]> {
  const role: { properties: { permissions: ArmPermission[] } } = await gFetch(token, ARM, `${roleId}?api-version=2022-04-01`);
  return role.properties.permissions;
}

// The group Azure already has a top-level resource in, found by type and name without a per-type api-version.
export async function findResourceGroupOf(token: string, subscriptionId: string, resource: string): Promise<string | undefined> {
  const [namespace, type, name] = resource.split("/");
  const filter = encodeURIComponent(`resourceType eq '${namespace}/${type}' and name eq '${name}'`);
  const found = await findListedResource(token, `/subscriptions/${subscriptionId}/resources?$filter=${filter}&api-version=2021-04-01`, name);
  return found?.id?.match(/resourceGroups\/([^/]+)/i)?.[1];
}

// Whether ARM has anything at this path; a 404 means no.
export async function armExists(token: string, path: string): Promise<boolean> {
  return !!await armGet(token, path);
}

export function formatAzureAccessError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const denied = message.match(/\b(401|403) (\/[^:]+):/);
  if (!denied) return message;
  const scope = denied[2].split("?")[0];
  const action = message.match(/perform action '([^']+)'/)?.[1];
  return `Azure denied access to ${scope} (HTTP ${denied[1]})\n\n${action ? ` Missing permissions: ${action}`: ""}\n
Ask an administrator for the required access at this scope or activate your eligible role in PIM at ${AZURE_PIM_ACTIVATION_URL} and recheck.
Recent role changes may take time to propagate. If prompted, sign in again.`;
}

// Evaluates the authenticated caller's grants, not another principal's role assignments or data access.
export async function ensureManagementAccess(account: AzureAccount, requirements: readonly ManagementAccessRequirement[], overrideTenantId?: string,
  read = (scope: string) => readPermissionsAtScope(account, scope, overrideTenantId),
  guidance = `Ask an administrator for the required access at the listed scopes or activate eligible roles in PIM at ${AZURE_PIM_ACTIVATION_URL} and recheck.`
): Promise<void> {
  const byScope = new Map<string, { actions: Set<string>; dataActions: Set<string> }>();
  for (const { scope, actions, dataActions = [] } of requirements) {
    const required = byScope.get(scope) ?? { actions: new Set<string>(), dataActions: new Set<string>() };
    actions.forEach((action) => required.actions.add(action));
    dataActions.forEach((action) => required.dataActions.add(action));
    byScope.set(scope, required);
  }
  const missing: string[] = [];
  for (const [scope, { actions, dataActions }] of byScope) {
    let permissions: ArmPermission[];
    try {
      permissions = await read(scope);
    } catch (err) {
      throw new Error(`Could not verify Azure management access at ${scope}. Details: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    const denied = [...actions].filter((action) => !grantsArmAction(permissions, action));
    const deniedData = [...dataActions].filter((action) => !grantsArmAction(permissions, action, true));
    if (denied.length || deniedData.length) {
      missing.push(`Azure access required at ${scope}${denied.length ? `\n\nMissing permissions: ${denied.join(", ")}` : ""}${deniedData.length ? `\n\nMissing data permissions: ${deniedData.join(", ")}` : ""}`);
    }
  }
  if (missing.length) {
    throw new MissingAccessError(`${missing.join("\n\n")}\n\nAsk an administrator for the required access at the listed scopes or activate eligible roles in PIM at ${AZURE_PIM_ACTIVATION_URL} and recheck.\nRecent role changes may take time to propagate. If prompted, sign in again.`);
  }
}

// Deprecated: Replaced by resolveScope in hooks/util/useAzureAccessCheck.ts; kept for reference.
// async function scopeExists(check: CardAccessCheck, scope: string, apiVersion: string): Promise<boolean> {
//   if (!check.existence.has(scope)) check.existence.set(scope, !!await armGet(check.token, `${scope}?api-version=${apiVersion}`));
//   return check.existence.get(scope)!;
// }

// Deprecated: Replaced by resolveScope in hooks/util/useAzureAccessCheck.ts; kept for reference.
// // Requires the actions at the resource itself or at its nearest existing parent when creating it.
// async function requireAtResource(check: CardAccessCheck, scope: string, api: string, actions: readonly string[], mustExist = false): Promise<void> {
//   let target = scope;
//   if (!await scopeExists(check, scope, api)) {
//     if (mustExist) throw new Error(`Azure resource ${scope} does not exist. Run its environment setup card first.`);
//     const group = scope.match(/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+/i)?.[0];
//     if (!group) throw new Error(`Cannot determine parent resource group for ${scope}`);
//     target = await scopeExists(check, group, "2021-04-01") ? group : check.sub;
//     let parent = scope.replace(/\/[^/]+\/[^/]+$/, "");
//     while ((parent.split("/providers/")[1]?.split("/").length ?? 0) >= 3) {
//       if (await scopeExists(check, parent, api)) {
//         target = parent;
//         break;
//       }
//       parent = parent.replace(/\/[^/]+\/[^/]+$/, "");
//     }
//     if (target === check.sub) check.requirements.push({ scope: check.sub, actions: ["Microsoft.Resources/subscriptions/resourceGroups/read", "Microsoft.Resources/subscriptions/resourceGroups/write"] });
//   }
//   check.requirements.push({ scope: target, actions });
// }

// Deprecated: Replaced by resolveScope in hooks/util/useAzureAccessCheck.ts; kept for reference.
// export async function requireGroupAndProviders(check: CardAccessCheck, { providers, actions }: NonNullable<CardResourceAccessRequest["createGroup"]>): Promise<void> {
//   const { account, subscriptionId, overrideTenantId, group, sub, requirements } = check;
//   const rg = resourceGroupScope(subscriptionId, group);
//   const groupExists = await scopeExists(check, rg, "2021-04-01");
//   if (!groupExists) {
//     await ensureResourceGroupCreationAccess(account, subscriptionId, overrideTenantId);
//     requirements.push({ scope: sub, actions: ["Microsoft.Resources/subscriptions/resourceGroups/write"] });
//   } else {
//     requirements.push({ scope: rg, actions: ["Microsoft.Resources/subscriptions/resourceGroups/read"] });
//   }
//   if (actions) requirements.push({ scope: groupExists ? rg : sub, actions });
//   requirements.push({ scope: sub, actions: ["Microsoft.Resources/subscriptions/providers/read"] });
//   for (const namespace of providers) {
//     if (await getProviderRegistrationState(account, subscriptionId, namespace, overrideTenantId) !== "Registered") {
//       requirements.push({ scope: sub, actions: [`${namespace}/register/action`] });
//     }
//   }
// }

// Deprecated: Replaced by resolveScope in hooks/util/useAzureAccessCheck.ts; kept for reference.
// export async function requireResource(check: CardAccessCheck, resource: ResourceAccess): Promise<void> {
//   const { type, api, name, actions, locate, mustExist, whenCreating, children = [], alongside = [] } = resource;
//   const { subscriptionId, sub, requirements } = check;
//   const found = locate ? await findListedResource(check.token, `${sub}/providers/${type}?api-version=${api}`, name) : null;
//   const group = resourceGroupScope(subscriptionId, found?.id?.match(/resourceGroups\/([^/]+)/i)?.[1] ?? check.group);
//   const scope = `${group}/providers/${type}/${name}`;
//   if (whenCreating && !await scopeExists(check, scope, api)) requirements.push({ scope: sub, actions: whenCreating });
//   await requireAtResource(check, scope, api, actions, mustExist);
//   for (const child of children) {
//     // probe: false is for children with no GET, such as POST-only app settings; the parent establishes the scope.
//     if (child.probe === false) requirements.push({ scope: `${scope}/${child.path}`, actions: child.actions });
//     else await requireAtResource(check, `${scope}/${child.path}`, api, child.actions);
//   }
//   for (const other of alongside) {
//     await requireAtResource(check, `${group}/providers/${other.type}/${other.name}`, other.api, other.actions);
//   }
// }

// ── Log Analytics workspace ────────────────────────────────────────────────────

export async function ensureLogAnalyticsWorkspace(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  overrideTenantId?: string
): Promise<{ id: string; result: EnsureResult }> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${name}?api-version=2022-10-01`;
  const existing = await armGet(token, path);
  if (existing) return { id: existing.id ?? "", result: "exists" };
  const created = await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ location, properties: { sku: { name: "PerGB2018" }, retentionInDays: 30 } }),
  });
  await pollProvisioning(async () => {
    const t = await getToken(account, ARM_SCOPES, overrideTenantId);
    return (await armGet(t, path))?.properties?.provisioningState;
  }, "Log Analytics workspace");
  return { id: created?.id ?? (await armGet(token, path))?.id ?? "", result: "created" };
}

// ── Subscription activity-log diagnostics ──────────────────────────────────────

export async function ensureSubscriptionDiagnostics(
  account: AzureAccount,
  subscriptionId: string,
  settingName: string,
  workspaceId: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/providers/Microsoft.Insights/diagnosticSettings/${settingName}?api-version=2021-05-01-preview`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        workspaceId,
        logs: [
          { category: "Administrative", enabled: true },
          { category: "Security", enabled: true },
        ],
      },
    }),
  });
  return "created";
}

export async function ensureBlobDiagnostics(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  storageAccountName: string,
  settingName: string,
  workspaceId: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/blobServices/default/providers/Microsoft.Insights/diagnosticSettings/${settingName}?api-version=2021-05-01-preview`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        workspaceId,
        logs: [
          { category: "StorageWrite", enabled: true },
          { category: "StorageDelete", enabled: true },
        ],
      },
    }),
  });
  return "created";
}

// ── Application Insights ───────────────────────────────────────────────────────

// The browser needs the whole connection string, not just the key, and it is only on the resource.
export async function getAppInsightsConnectionString(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  overrideTenantId?: string
): Promise<string> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/components/${name}?api-version=2020-02-02`;
  const component = await armGet(token, path);
  return (component?.properties as { ConnectionString?: string } | undefined)?.ConnectionString ?? "";
}

export async function ensureAppInsights(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  workspaceId: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/components/${name}?api-version=2020-02-02`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({
      location,
      kind: "web",
      properties: { Application_Type: "web", WorkspaceResourceId: workspaceId },
    }),
  });
  return "created";
}

// ── DNS zone + TXT record ──────────────────────────────────────────────────────

export async function ensureDnsZone(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  dnsName: string,
  overrideTenantId?: string
): Promise<{ nameServers: string[]; result: EnsureResult }> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/dnsZones/${dnsName}?api-version=2018-05-01`;
  const existing = await armGet(token, path);
  if (existing) return { nameServers: existing.properties?.nameServers ?? [], result: "exists" };
  const created = await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({ location: "global" }) });
  return { nameServers: created?.properties?.nameServers ?? [], result: "created" };
}

// Ensures the apex TXT record contains `value`. Merges with existing TXT values rather than overwriting.
export async function ensureDnsTxtRecord(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  dnsName: string,
  value: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/dnsZones/${dnsName}/TXT/@?api-version=2018-05-01`;
  const existing = await armGet(token, path);
  const records: { value: string[] }[] = existing?.properties?.TXTRecords ?? [];
  if (records.some((r) => r.value.includes(value))) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ properties: { TTL: 3600, TXTRecords: [...records, { value: [value] }] } }),
  });
  return "created";
}

export async function findDnsZone(
  account: AzureAccount,
  subscriptionId: string,
  dnsName: string,
  overrideTenantId?: string
): Promise<{ nameServers: string[]; txtValues: string[] } | null> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const list = await armGet(token, `/subscriptions/${subscriptionId}/providers/Microsoft.Network/dnszones?api-version=2018-05-01`);
  type Zone = { id: string; name: string; properties?: { nameServers?: string[] } };
  const zone = ((list as { value?: Zone[] } | null)?.value ?? []).find((z) => z.name === dnsName);
  if (!zone) return null;
  const txt = await armGet(token, `${zone.id}/TXT/@?api-version=2018-05-01`);
  const records: { value: string[] }[] = txt?.properties?.TXTRecords ?? [];
  return { nameServers: zone.properties?.nameServers ?? [], txtValues: records.flatMap((r) => r.value) };
}

// ── Storage account + container ────────────────────────────────────────────────

type StorageAccountRow = { id?: string; name?: string; properties?: { primaryEndpoints?: { web?: string } } };

// Deprecated: Moved to azureArmHelper.ts; kept for reference.
// async function findListedResource<T extends { id?: string; name?: string }>(token: string, firstPath: string, name: string): Promise<T | null> {
//   const visited = new Set<string>();
//   let path: string | null = firstPath;
//   while (path) {
//     if (visited.has(path)) throw new Error("Azure returned a looping resource list URL");
//     visited.add(path);
//     const page = await armGet(token, path) as { value?: T[]; nextLink?: string } | null;
//     if (!page) return null;
//     if (!Array.isArray(page.value) || page.value.some((resource) =>
//       typeof resource?.name !== "string" || typeof resource?.id !== "string"
//     )) throw new Error("Azure returned an invalid resource list response");
//     const found = page.value.find((resource) => resource.name?.toLowerCase() === name.toLowerCase());
//     if (found) return found;
//     if (!page.nextLink) return null;
//     const next = new URL(page.nextLink, ARM);
//     if (next.origin !== ARM) throw new Error("Azure returned an unexpected resource list URL");
//     path = `${next.pathname}${next.search}`;
//   }
//   return null;
// }

async function findStorageAccount(token: string, subscriptionId: string, name: string): Promise<StorageAccountRow | null> {
  return findListedResource<StorageAccountRow>(token, `/subscriptions/${subscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`, name);
}

// checkNameAvailability never says who holds a name; this is what tells "ours, elsewhere" apart.
// ponytail: subscription-scoped, widen to Resource Graph if accounts spread across subscriptions.
export async function findStorageAccountGroup(account: AzureAccount, subscriptionId: string, name: string, overrideTenantId?: string): Promise<string | null> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const found = await findStorageAccount(token, subscriptionId, name);
  return found?.id?.match(/resourceGroups\/([^/]+)/i)?.[1] ?? null;
}

// Azure answers for the whole world, so "unavailable" can also mean someone else's account.
export async function storageAccountNameAvailable(account: AzureAccount, subscriptionId: string, name: string, overrideTenantId?: string): Promise<boolean> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const availability = await gFetch(token, ARM, `/subscriptions/${subscriptionId}/providers/Microsoft.Storage/checkNameAvailability?api-version=2023-01-01`, {
    method: "POST",
    body: JSON.stringify({ name, type: "Microsoft.Storage/storageAccounts" }),
  });
  return availability?.nameAvailable !== false;
}

export async function ensureStorageAccount(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${name}?api-version=2023-01-01`;
  if (await armGet(token, path)) return "exists";

  const availability = await gFetch(token, ARM, `/subscriptions/${subscriptionId}/providers/Microsoft.Storage/checkNameAvailability?api-version=2023-01-01`, {
    method: "POST",
    body: JSON.stringify({ name, type: "Microsoft.Storage/storageAccounts" }),
  });
  if (availability?.nameAvailable === false) {
    throw new Error(`Storage account name "${name}" unavailable: ${availability.message ?? availability.reason}`);
  }

  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ location, sku: { name: "Standard_LRS" }, kind: "StorageV2" }),
  });
  await pollProvisioning(async () => {
    const t = await getToken(account, ARM_SCOPES, overrideTenantId);
    return (await armGet(t, path))?.properties?.provisioningState;
  }, "Storage account");
  return "created";
}

export async function ensureBlobCors(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  allowedOrigins: string[],
  overrideTenantId?: string
): Promise<void> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${name}/blobServices/default?api-version=2023-01-01`;
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        cors: {
          corsRules: [
            {
              allowedOrigins,
              allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT"],
              allowedHeaders: ["*"],
              exposedHeaders: ["*"],
              maxAgeInSeconds: 3600,
            },
          ],
        },
      },
    }),
  });
}

export async function ensureBlobServiceProperties(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  allowedOrigins: string[],
  overrideTenantId?: string,
  indexDocument = "index.html"
): Promise<void> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${name}/blobServices/default?api-version=2025-08-01`;
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        // The PUT replaces what it is given, so both have to travel together or one wipes the other.
        staticWebsite: { enabled: true, indexDocument, errorDocument404Path: indexDocument },
        cors: {
          corsRules: [
            {
              allowedOrigins,
              allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT"],
              allowedHeaders: ["*"],
              exposedHeaders: ["*"],
              maxAgeInSeconds: 3600,
            },
          ],
        },
      },
    }),
  });
}

// The web endpoint's host is assigned by Azure, so it is read back rather than composed.
export async function getStaticWebsiteUrl(account: AzureAccount, subscriptionId: string, name: string, overrideTenantId?: string): Promise<string | null> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const web = (await findStorageAccount(token, subscriptionId, name))?.properties?.primaryEndpoints?.web;
  return web ? web.replace(/\/+$/, "") : null;
}

// ARM refuses to delete the resource (and so its group) until the lock is removed. Control plane only:
// blobs inside can still be deleted, so this guards the account, not the state file.
export async function ensureDeleteLock(
  account: AzureAccount,
  resourceId: string,
  lockName: string,
  notes: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `${resourceId}/providers/Microsoft.Authorization/locks/${lockName}?api-version=2020-05-01`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({ properties: { level: "CanNotDelete", notes } }) });
  return "created";
}

export async function ensureStorageContainer(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  storageAccountName: string,
  containerName: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/blobServices/default/containers/${containerName}?api-version=2023-01-01`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({ properties: { publicAccess: "None" } }) });
  return "created";
}

// ── Scoped RBAC role assignment ────────────────────────────────────────────────
// Same as azureGraph's ensureRbacRole but at an arbitrary scope (e.g. a storage account)
export async function hasRbacRoleAtScope(
  account: AzureAccount,
  scope: string,
  principalId: string,
  roleName: string,
  overrideTenantId?: string
): Promise<boolean> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const roleId = RBAC_ROLE_IDS[roleName];
  if (!roleId) throw new Error(`Unknown Azure role: ${roleName}`);
  const visited = new Set<string>();
  let path: string | null = `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${principalId}')`;
  while (path) {
    if (visited.has(path)) throw new Error("Azure returned a looping role assignments URL");
    visited.add(path);
    const existing: { value: { properties: { roleDefinitionId: string } }[]; nextLink?: string } = await gFetch(token, ARM, path);
    if (!existing || !Array.isArray(existing.value) || existing.value.some((assignment) =>
      typeof assignment?.properties?.roleDefinitionId !== "string"
    )) throw new Error("Azure returned an invalid role assignments response");
    if (existing.value.some((assignment) => assignment.properties.roleDefinitionId.toLowerCase().endsWith(`/${roleId.toLowerCase()}`))) return true;
    if (!existing.nextLink) return false;
    const next = new URL(existing.nextLink, ARM);
    if (next.origin !== ARM) throw new Error("Azure returned an unexpected role assignments URL");
    path = `${next.pathname}${next.search}`;
  }
  return false;
}

export async function ensureRbacRoleAtScope(
  account: AzureAccount,
  scope: string,
  principalId: string,
  roleName: string,
  overrideTenantId?: string,
  principalType: "ServicePrincipal" | "Group" | "User" = "ServicePrincipal"
): Promise<EnsureResult> {
  if (await hasRbacRoleAtScope(account, scope, principalId, roleName, overrideTenantId)) return "exists";

  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const roleId = RBAC_ROLE_IDS[roleName];
  const assignmentName = await deterministicUuid(scope, roleId, principalId);
  await gFetch(token, ARM, `${scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
        principalId,
        principalType,
      },
    }),
  });
  return "created";
}

// PIM for Azure resources: the principal is eligible and activates the role when needed. Needs Entra ID P2.
export async function ensureRbacRoleEligibility(
  account: AzureAccount,
  scope: string,
  principalId: string,
  roleName: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const roleId = RBAC_ROLE_IDS[roleName];
  if (!roleId) throw new Error(`Unknown Azure role: ${roleName}`);
  type Schedule = { properties: { principalId: string; roleDefinitionId: string } };
  let path = `${scope}/providers/Microsoft.Authorization/roleEligibilitySchedules?api-version=2020-10-01&$filter=atScope()`;
  for (;;) {
    const page: { value?: Schedule[]; nextLink?: string } = await gFetch(token, ARM, path);
    const found = (page?.value ?? []).some(
      (s) => s.properties?.principalId === principalId && s.properties?.roleDefinitionId?.toLowerCase().endsWith(`/${roleId.toLowerCase()}`)
    );
    if (found) return "exists";
    if (!page?.nextLink) break;
    const next = new URL(page.nextLink, ARM);
    if (next.origin !== ARM) throw new Error("Azure returned an unexpected role eligibility URL");
    path = `${next.pathname}${next.search}`;
  }
  // A fresh name each time: an old request with a fixed name would clash once its eligibility was removed.
  await gFetch(token, ARM, `${scope}/providers/Microsoft.Authorization/roleEligibilityScheduleRequests/${createRandomUuid()}?api-version=2020-10-01`, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        principalId,
        roleDefinitionId: `${scope}/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
        requestType: "AdminAssign",
        justification: "Set up by ZenInstaller",
        scheduleInfo: { startDateTime: new Date().toISOString(), expiration: { type: "NoExpiration" } },
      },
    }),
  });
  return "created";
}

export function storageAccountScope(subscriptionId: string, resourceGroup: string, storageAccountName: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}`;
}

export function dnsZoneScope(subscriptionId: string, resourceGroup: string, dnsName: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/dnsZones/${dnsName}`;
}
export function resourceGroupScope(subscriptionId: string, resourceGroup: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;
}
// Any resource in a group, e.g. type "Microsoft.Web/sites".
export function armResourceId(subscriptionId: string, resourceGroup: string, type: string, name: string): string {
  return `${resourceGroupScope(subscriptionId, resourceGroup)}/providers/${type}/${name}`;
}

export function subscriptionScope(subscriptionId: string): string {
  return `/subscriptions/${subscriptionId}`;
}

// ── Remote terminal infrastructure ─────────────────────────────────────────────

const WEBPUBSUB_API = "2023-02-01";
const WEB_API = "2023-12-01";

export async function findWebPubSubGroup(account: AzureAccount, subscriptionId: string, name: string, overrideTenantId?: string): Promise<string | null> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  // The resources index, like the Function App lookup, rather than the provider's subscription-wide list.
  return (await findResourceGroupOf(token, subscriptionId, `Microsoft.SignalRService/webPubSub/${name}`)) ?? null;
}

export async function webPubSubNameAvailable(
  account: AzureAccount,
  subscriptionId: string,
  location: string,
  name: string,
  overrideTenantId?: string
): Promise<boolean> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const availability = await gFetch(
    token,
    ARM,
    `/subscriptions/${subscriptionId}/providers/Microsoft.SignalRService/locations/${location}/checkNameAvailability?api-version=${WEBPUBSUB_API}`,
    { method: "POST", body: JSON.stringify({ name, type: "Microsoft.SignalRService/WebPubSub" }) }
  );
  return availability?.nameAvailable !== false;
}

export async function findFunctionAppGroup(account: AzureAccount, subscriptionId: string, name: string, overrideTenantId?: string): Promise<string | null> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  // The resources index, since Microsoft.Web's own subscription-wide site list can fail with a 502 ProviderError.
  return (await findResourceGroupOf(token, subscriptionId, `Microsoft.Web/sites/${name}`)) ?? null;
}

export async function functionAppNameAvailable(account: AzureAccount, subscriptionId: string, name: string, overrideTenantId?: string): Promise<boolean> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const availability = await gFetch(token, ARM, `/subscriptions/${subscriptionId}/providers/Microsoft.Web/checknameavailability?api-version=${WEB_API}`, {
    method: "POST",
    body: JSON.stringify({ name, type: "Microsoft.Web/sites" }),
  });
  return availability?.nameAvailable !== false;
}

export async function ensureWebPubSub(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  sku: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.SignalRService/webPubSub/${name}?api-version=${WEBPUBSUB_API}`;
  if (await armGet(token, path)) return "exists";

  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ location, sku: { name: sku, capacity: 1 } }),
  });
  await pollProvisioning(async () => {
    const t = await getToken(account, ARM_SCOPES, overrideTenantId);
    return (await armGet(t, path))?.properties?.provisioningState;
  }, "Web PubSub");
  return "created";
}

// The hub settings record. Connections already require a token without it; this pins that shut so a
// portal change cannot quietly enable anonymous connect.
export async function ensureWebPubSubHub(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  webPubSubName: string,
  hubName: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.SignalRService/webPubSub/${webPubSubName}/hubs/${hubName}?api-version=${WEBPUBSUB_API}`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ properties: { anonymousConnectPolicy: "deny" } }),
  });
  return "created";
}

export async function ensureStorageTable(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  storageAccountName: string,
  tableName: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/tableServices/default/tables/${tableName}?api-version=2023-01-01`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({}) });
  return "created";
}

export async function ensureFlexServicePlan(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  overrideTenantId?: string
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/serverfarms/${name}?api-version=${WEB_API}`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({
      location,
      kind: "functionapp",
      sku: { name: "FC1", tier: "FlexConsumption" },
      properties: { reserved: true },
    }),
  });
  return "created";
}

export type FunctionAppSettings = Record<string, string>;

// Flex Consumption, system-assigned identity, deployment container reached by that identity —
// the same shape web/deploy-remote-terminal/env/main.tf declares.
export async function ensureFlexFunctionApp(
  account: AzureAccount,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  planId: string,
  deploymentContainerUrl: string,
  appSettings: FunctionAppSettings,
  allowedOrigins: string[],
  overrideTenantId?: string
): Promise<{ result: EnsureResult; principalId: string }> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}?api-version=${WEB_API}`;
  const existing = await armGet(token, path);

  if (!existing) {
    await gFetch(token, ARM, path, {
      method: "PUT",
      body: JSON.stringify({
        location,
        kind: "functionapp,linux",
        identity: { type: "SystemAssigned" },
        properties: {
          serverFarmId: planId,
          functionAppConfig: {
            deployment: {
              storage: {
                type: "blobContainer",
                value: deploymentContainerUrl,
                authentication: { type: "SystemAssignedIdentity" },
              },
            },
            runtime: { name: "node", version: "22" },
            scaleAndConcurrency: { maximumInstanceCount: 100, instanceMemoryMB: 2048 },
          },
          siteConfig: {
            appSettings: Object.entries(appSettings).map(([nameKey, value]) => ({ name: nameKey, value })),
            cors: { allowedOrigins },
          },
        },
      }),
    });
    await pollProvisioning(async () => {
      const t = await getToken(account, ARM_SCOPES, overrideTenantId);
      return (await armGet(t, path))?.identity?.principalId ? "Succeeded" : undefined;
    }, "Function App");
  }

  const t = await getToken(account, ARM_SCOPES, overrideTenantId);
  const site = await armGet(t, path);
  const principalId = site?.identity?.principalId;
  if (!principalId) throw new Error(`Function App ${name} has no system-assigned identity`);
  return { result: existing ? "exists" : "created", principalId };
}

export function webPubSubScope(subscriptionId: string, resourceGroup: string, name: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.SignalRService/webPubSub/${name}`;
}

export function appInsightsScope(subscriptionId: string, resourceGroup: string, name: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/components/${name}`;
}

export function servicePlanId(subscriptionId: string, resourceGroup: string, name: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/serverfarms/${name}`;
}
