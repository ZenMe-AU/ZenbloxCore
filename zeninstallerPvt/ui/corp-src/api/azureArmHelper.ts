/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Internals used only by azureArm: shared ARM reads and the card access check. This file never imports azureArm, so the dependency runs one way.
import { getToken } from "../auth/msal";
import { azFetch as gFetch, ARM } from "./azureFetch";
import { ARM_SCOPES, RESOURCE_GROUP_ACCESS } from "../config/azureConfig";
import type { ArmRole, ArmScope, AzureAccount } from "../types";

export type ArmPermission = { actions: string[]; notActions?: string[]; dataActions?: string[]; notDataActions?: string[] };
export type ManagementAccessRequirement = { scope: string; actions: readonly string[]; dataActions?: readonly string[] };

// Same as armGet in azureArm.ts, which stays there for now; merge the two when it moves here.
async function armGet(token: string, path: string): Promise<unknown> {
  try {
    return await gFetch(token, ARM, path);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("404")) return null;
    throw err;
  }
}

export async function findListedResource<T extends { id?: string; name?: string }>(token: string, firstPath: string, name: string): Promise<T | null> {
  const visited = new Set<string>();
  let path: string | null = firstPath;
  while (path) {
    if (visited.has(path)) throw new Error("Azure returned a looping resource list URL");
    visited.add(path);
    const page = await armGet(token, path) as { value?: T[]; nextLink?: string } | null;
    if (!page) return null;
    if (!Array.isArray(page.value) || page.value.some((resource) =>
      typeof resource?.name !== "string" || typeof resource?.id !== "string"
    )) throw new Error("Azure returned an invalid resource list response");
    const found = page.value.find((resource) => resource.name?.toLowerCase() === name.toLowerCase());
    if (found) return found;
    if (!page.nextLink) return null;
    const next = new URL(page.nextLink, ARM);
    if (next.origin !== ARM) throw new Error("Azure returned an unexpected resource list URL");
    path = `${next.pathname}${next.search}`;
  }
  return null;
}

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

// Shared state for one card access check: lookups run once, requirements accumulate in order.
export type CardAccessCheck = {
  account: AzureAccount;
  subscriptionId: string;
  overrideTenantId?: string;
  sub: string;
  lookups: Map<string, Promise<unknown>>;
  requirements: ManagementAccessRequirement[];
};

// Each lookup runs once per check.
function cached<T>(check: CardAccessCheck, key: string, load: () => Promise<T>): Promise<T> {
  if (!check.lookups.has(key)) check.lookups.set(key, load());
  return check.lookups.get(key) as Promise<T>;
}

// Grants at a scope: the signed-in user's from the Permissions API, which answers only for the caller and 404s for a missing resource;
// another principal's (by Entra object id) from its role assignments there or above (groups included), expanded to their role definitions.
// Notice: deny assignments and role assignment conditions aren't evaluated for another principal; Azure's own check still applies when it runs.
export const permissionsAt = (check: CardAccessCheck, scope: string, objectId = ""): Promise<ArmPermission[]> =>
  cached(check, `permissions ${objectId} ${scope}`, async () => {
    if (!objectId) return readPermissionsAtScope(check.account, scope, check.overrideTenantId);
    const token = await armToken(check);
    const assignments: { properties: { scope: string; roleDefinitionId: string } }[] = [];
    for (let path: string | null = `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${objectId}')`; path;) {
      const page: { value: typeof assignments; nextLink?: string } = await gFetch(token, ARM, path);
      assignments.push(...page.value);
      const next = page.nextLink ? new URL(page.nextLink) : null;
      path = next && `${next.pathname}${next.search}`;
    }
    // assignedTo also lists assignments below the scope; for a subscription or narrower scope, a management group or root assignment is above it.
    const above = (assigned: string) => {
      const at = assigned.toLowerCase().replace(/\/$/, "");
      return !at.startsWith("/subscriptions/") || scope.toLowerCase() === at || scope.toLowerCase().startsWith(`${at}/`);
    };
    const roleIds = [...new Set(assignments.filter(({ properties }) => above(properties.scope)).map(({ properties }) => properties.roleDefinitionId))];
    const roles: { properties: { permissions: ArmPermission[] } }[] = await Promise.all(roleIds.map((id) =>
      cached(check, `role ${id}`, () => gFetch(token, ARM, `${id}?api-version=2022-04-01`))));
    return roles.flatMap(({ properties }) => properties.permissions);
  });

// PIM activation/deactivation can leave the previously cached access token stale.
const armToken = (check: CardAccessCheck) => cached(check, "token", () => getToken(check.account, ARM_SCOPES, check.overrideTenantId, true));

const groupExists = (check: CardAccessCheck, group: string) =>
  cached(check, `group ${group}`, async () => !!await armGet(await armToken(check), `${group}?api-version=2021-04-01`));

// The group Azure already has a top-level resource in, found by type and name without a per-type api-version.
function locateGroup(check: CardAccessCheck, resource: string): Promise<string | undefined> {
  const [namespace, type, name] = resource.split("/");
  return cached(check, `locate ${namespace}/${type}/${name}`, async () => {
    const filter = encodeURIComponent(`resourceType eq '${namespace}/${type}' and name eq '${name}'`);
    const found = await findListedResource(await armToken(check), `${check.sub}/resources?$filter=${filter}&api-version=2021-04-01`, name);
    return found?.id?.match(/resourceGroups\/([^/]+)/i)?.[1];
  });
}

// Children are checked like roles of their own, under the parent resource.
export function withChildren({ children = [], ...role }: ArmRole): ArmRole[] {
  const { scope } = role;
  if (!children.length) return [role];
  if (typeof scope === "string" || !scope.resource) throw new Error("Only a resource scope can have children.");
  return [role, ...children.flatMap(({ path, ...child }) => withChildren({ ...child, objectId: role.objectId, scope: { ...scope, resource: `${scope.resource}/${path}` } }))];
}

// Where a role's actions are checked: the resource, else its nearest existing parent, else the subscription that creates the group.
export async function resolveScope(check: CardAccessCheck, scope: ArmScope): Promise<string> {
  if (scope === "subscription") return check.sub;
  if (scope === "tenant") return `/providers/Microsoft.Management/managementGroups/${check.overrideTenantId || check.account.tenantId}`;
  const { resource, mustExist } = scope;
  const locateBy = scope.locate === true ? resource : scope.locate;
  const group = `${check.sub}/resourceGroups/${(locateBy && await locateGroup(check, locateBy)) || scope.resourceGroup}`;
  const missing = (path: string) => new Error(`Azure resource ${path} does not exist. Run its environment setup card first.`);
  if (!await groupExists(check, group)) {
    if (mustExist) throw missing(resource ? `${group}/providers/${resource}` : group);
    check.requirements.push({ scope: check.sub, actions: RESOURCE_GROUP_ACCESS });
    return check.sub;
  }
  // Azure answers 404 for a resource it doesn't have, so reading permissions doubles as the existence probe.
  for (let path = resource; path && path.split("/").length >= 3; path = path.replace(/\/[^/]+\/[^/]+$/, "")) {
    const target = `${group}/providers/${path}`;
    try {
      await permissionsAt(check, target);
      return target;
    } catch (err) {
      if (!(err instanceof Error && err.message.startsWith("404"))) throw err;
      if (mustExist) throw missing(target);
    }
  }
  return group;
}
