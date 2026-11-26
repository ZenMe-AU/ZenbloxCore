/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { getAzureAccessFailureKind, type AzureAccessFailureKind } from "../../logic/azureAccessFailure";
import { getToken, hasScopeConsent } from "../../auth/msal";
import {
  armExists, ensureManagementAccess, ensureResourceGroupCreationAccess, findResourceGroupOf, formatAzureAccessError, getProviderRegistrationState,
  listRoleAssignments, readPermissionsAtScope, readRolePermissions, subscriptionScope, type ArmPermission, type ManagementAccessRequirement,
} from "../../api/azureArm";
import { ARM_SCOPES, RESOURCE_GROUP_ACCESS } from "../../config/azureConfig";
import { MissingAccessError, roleIdsAtScope } from "../../logic/azureAccess";
import type { ArmRole, ArmScope, AzureAccount, AzureTarget, CardResourceAccessRequest } from "../../types";

// TODO: turn status into a state machine.
export type SubscriptionAccess = {
  // warning: the check ran and found something missing; error: it couldn't run.
  status: "idle" | "checking" | "ready" | "warning" | "error";
  error: string | null;
  failureKind?: AzureAccessFailureKind | null;
  retry: () => void;
};

export type ResourceGroupCreationAccess = SubscriptionAccess;

export function useSubscriptionAccess(
  { azureAccount, subscriptionId, tenantId }: AzureTarget,
  checkAccess: typeof ensureResourceGroupCreationAccess,
  formatError: (error: unknown) => string = formatAzureAccessError
): SubscriptionAccess {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    account: AzureAccount;
    subscriptionId: string;
    tenantId: string | undefined;
    checkAccess: typeof checkAccess;
    attempt: number;
    error: string | null;
    failureKind: AzureAccessFailureKind | null;
  } | null>(null);

  useEffect(() => {
    if (!azureAccount || !subscriptionId) return;
    let cancelled = false;
    const check = async () => {
      let error: string | null = null;
      let failureKind: AzureAccessFailureKind | null = null;
      try {
        await checkAccess(azureAccount, subscriptionId, tenantId);
      } catch (err) {
        failureKind = getAzureAccessFailureKind(err);
        error = formatError(err) || "Could not verify subscription access. Recheck subscription access before creating resources.";
      }
      if (!cancelled) setResult({ account: azureAccount, subscriptionId, tenantId, checkAccess, attempt, error, failureKind });
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId, attempt, checkAccess, formatError]);

  const current =
    result?.account === azureAccount && result?.subscriptionId === subscriptionId && result?.tenantId === tenantId &&
    result?.checkAccess === checkAccess && result?.attempt === attempt;
  const error = current ? result.error : null;
  const status = !azureAccount || !subscriptionId ? "idle" : !current ? "checking" : error ? "error" : "ready";
  return { status, error, failureKind: current ? result.failureKind : null, retry: () => setAttempt((previous) => previous + 1) };
}

export function useAzureAccessCheck(target: AzureTarget): ResourceGroupCreationAccess {
  return useSubscriptionAccess(target, ensureResourceGroupCreationAccess);
}
type CardAccessCheck = {
  account: AzureAccount;
  subscriptionId: string;
  overrideTenantId?: string;
  sub: string;
  lookups: Map<string, Promise<unknown>>;
  requirements: ManagementAccessRequirement[];
};

// What the checks found missing, all at once: roles (the message per principal), providers to register, scopes to consent to.
export type CardAccessGaps = { missingRoles: string | null; unregisteredProviders: string[]; missingConsent: string[] };

// Missing resources are checked at their existing parent; missing groups need subscription access.
export async function ensureCardResourceAccess(
  account: AzureAccount, subscriptionId: string, request: CardResourceAccessRequest, overrideTenantId?: string
): Promise<CardAccessGaps> {
  const check: CardAccessCheck = { account, subscriptionId, overrideTenantId, sub: subscriptionScope(subscriptionId), lookups: new Map(), requirements: [] };
  // Requirements per principal: "" is the signed-in user, else an Entra object id.
  const byPrincipal = new Map([["", check.requirements]]);
  const unregisteredProviders = await requireProviders(check, request.resourceProviders);
  for (const { scope, objectId = "", actions, dataActions, createActions } of request.armRoles.flatMap(withChildren)) {
    check.requirements = byPrincipal.get(objectId) ?? [];
    byPrincipal.set(objectId, check.requirements);
    const at = await resolveScope(check, scope);
    check.requirements.push({ scope: at, actions, dataActions });
    if (createActions && typeof scope !== "string" && !at.endsWith(`/providers/${scope.resource}`)) check.requirements.push({ scope: check.sub, actions: createActions });
  }
  // Missing roles are kept, not thrown, so providers and consent are still checked; a check that can't run still throws.
  const missingRoles: string[] = [];
  for (const [objectId, requirements] of byPrincipal) {
    try {
      await ensureManagementAccess(account, requirements, overrideTenantId, (scope) => permissionsAt(check, scope, objectId), objectId
        ? `Principal ${objectId} needs these. Assign it a role that includes them at the listed scopes in Access control (IAM), then recheck.`
        : undefined);
    } catch (err) {
      if (!(err instanceof MissingAccessError)) throw err;
      missingRoles.push(err.message);
    }
  }
  // One scope at a time, so the list names exactly the ones without consent.
  const consented = await Promise.all(request.appConsent.map((scope) => hasScopeConsent(account, [scope], overrideTenantId)));
  return { missingRoles: missingRoles.join("\n\n") || null, unregisteredProviders, missingConsent: request.appConsent.filter((_, i) => !consented[i]) };
}

// A provider that isn't Registered needs its register action; returns the ones Azure says aren't registered.
async function requireProviders(check: CardAccessCheck, providers: readonly string[]): Promise<string[]> {
  if (!providers.length) return [];
  check.requirements.push({ scope: check.sub, actions: ["Microsoft.Resources/subscriptions/providers/read"] });
  const unregistered: string[] = [];
  for (const namespace of providers) {
    const state = await getProviderRegistrationState(check.account, check.subscriptionId, namespace, check.overrideTenantId);
    if (state !== "Registered") check.requirements.push({ scope: check.sub, actions: [`${namespace}/register/action`] });
    if (state === "NotRegistered" || state === "Unregistered") unregistered.push(namespace);
  }
  return unregistered;
}

// Each lookup runs once per check.
function cached<T>(check: CardAccessCheck, key: string, load: () => Promise<T>): Promise<T> {
  if (!check.lookups.has(key)) check.lookups.set(key, load());
  return check.lookups.get(key) as Promise<T>;
}

// Grants at a scope: the signed-in user's from the Permissions API, which answers only for the caller and 404s for a missing resource;
// another principal's (by Entra object id) from its role assignments there or above (groups included), expanded to their role definitions.
// Notice: deny assignments and role assignment conditions aren't evaluated for another principal; Azure's own check still applies when it runs.
const permissionsAt = (check: CardAccessCheck, scope: string, objectId = ""): Promise<ArmPermission[]> =>
  cached(check, `permissions ${objectId} ${scope}`, async () => {
    if (!objectId) return readPermissionsAtScope(check.account, scope, check.overrideTenantId);
    const token = await armToken(check);
    const roleIds = roleIdsAtScope(await listRoleAssignments(token, objectId, scope), scope);
    const roles = await Promise.all(roleIds.map((id) => cached(check, `role ${id}`, () => readRolePermissions(token, id))));
    return roles.flat();
  });

// PIM activation/deactivation can leave the previously cached access token stale.
const armToken = (check: CardAccessCheck) => cached(check, "token", () => getToken(check.account, ARM_SCOPES, check.overrideTenantId, true));

const groupExists = (check: CardAccessCheck, group: string) =>
  cached(check, `group ${group}`, async () => armExists(await armToken(check), `${group}?api-version=2021-04-01`));

// The group Azure already has the top-level resource in; looked up once per resource.
const locateGroup = (check: CardAccessCheck, resource: string) =>
  cached(check, `locate ${resource.split("/").slice(0, 3).join("/")}`, async () => findResourceGroupOf(await armToken(check), check.subscriptionId, resource));

// Children are checked like roles of their own, under the parent resource.
function withChildren({ children = [], ...role }: ArmRole): ArmRole[] {
  const { scope } = role;
  if (!children.length) return [role];
  if (typeof scope === "string" || !scope.resource) throw new Error("Only a resource scope can have children.");
  return [role, ...children.flatMap(({ path, ...child }) => withChildren({ ...child, objectId: role.objectId, scope: { ...scope, resource: `${scope.resource}/${path}` } }))];
}

// Where a role's actions are checked: the resource, else its nearest existing parent, else the subscription that creates the group.
async function resolveScope(check: CardAccessCheck, scope: ArmScope): Promise<string> {
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
