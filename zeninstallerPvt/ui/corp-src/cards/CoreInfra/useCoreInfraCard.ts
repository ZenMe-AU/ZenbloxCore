/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import {
  resourceGroupExists,
  findStorageAccountGroup,
  storageAccountScope,
  armExists,
  armResourceId,
  findDnsZone,
  findWebPubSubGroup,
  findFunctionAppGroup,
  listLocations,
  type AzureLocation,
} from "../../api/azureArm";
import { getEntraDomain } from "../../api/azureGraph";
import { ensureScopeConsent, getToken } from "../../auth/msal";
import { useProvisioning, type UseProvisioning } from "../../hooks/util/useProvisioning";
import { isSettled } from "../../logic/provisioning";
import { DEFAULT_AZURE_LOCATION } from "../../logic/naming";
import { APP_SCOPES, ARM_SCOPES, AZURE_CLIENT_ID, DOMAIN_SCOPES, STORAGE_SCOPES } from "../../config/azureConfig";
import { getVariableDisplayName } from "../../logic/variables";
import type { CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import type { ResourceName } from "./provisioningParts";
import { useTerraformStatePart, type UseTerraformStatePart } from "./useTerraformStatePart";
import { useDomainPart, type UseDomainPart } from "./useDomainPart";
import { useFrontendPart, type UseFrontendPart } from "./useFrontendPart";
import { useBackendPart, type UseBackendPart } from "./useBackendPart";
import type { Account, AzureAccount, AzureSpTarget, AzureTarget, CardHook, CardRequirements, CardStatus } from "../../types";

type FaceInput = {
  parts: readonly { done: boolean; creationAccess: Pick<CardResourceAccess, "status"> }[];
  names?: readonly Pick<ResourceName, "checking">[]; // The editable names, which are checked against Azure on confirm.
  configured: boolean; // This app's Azure registration, the signed-in account and a subscription are all there.
  corpName: string;
  hosting?: Pick<UseProvisioning, "plan" | "state" | "running">;
};

export const coreInfraAppContextId = "core_infra" as const;

declare module "../../appContext" {
  interface SharedCardDataById {
    [coreInfraAppContextId]: Record<never, never>;
  }
}

// The card's face over its four parts; while the card runs, the run speaks first.
export function hostingEnvironmentFace({ parts, names = [], configured, corpName, hosting }: FaceInput): Pick<CardHook, "done" | "status" | "summary"> {
  const done = parts.every((part) => part.done);
  // The card runs the parts as one graph, so its run speaks first: what runs now, then what waits on the user.
  if (hosting) {
    const tasks = [...hosting.plan.tasks.values()];
    const runningTask = hosting.running ? tasks.find((task) => ["running", "retrying"].includes(hosting.state[task.id]?.status)) : undefined;
    if (hosting.running) return { done, status: "loading", summary: runningTask?.label ?? "Setting up the hosting environment" };
    const waiting = tasks.find((task) => hosting.state[task.id]?.status === "action_required");
    if (waiting) return { done, status: "error", summary: `Action required: ${waiting.label}` };
    const failed = tasks.find((task) => hosting.state[task.id]?.status === "failed");
    if (failed) return { done, status: "error", summary: `Failed: ${failed.label}` };
  }
  // Then what stops a run: setup, a check in flight, missing access, a missing company code.
  const access = (status: CardResourceAccess["status"]) => parts.some((part) => part.creationAccess.status === status);
  const face = (status: CardStatus, summary: string) => ({ done, status, summary });
  if (!configured) return face("error", "Unavailable");
  if (access("checking")) return face("loading", "Checking Azure resource access");
  if (names.some((name) => name.checking)) return face("loading", "Checking a resource name");
  if (access("error")) return face("error", "Insufficient permissions to continue");
  if (!corpName) return face("warning", `${getVariableDisplayName("NAME")} not set`);
  return done ? face("complete", "Hosting environment ready") : face("warning", "Set up the private hosting environment");
}

/*
 * The hosting card runs its two blocks at once, so a consent redirect from one part would cut the
 * other off mid-run. Asking for every part's consent before either starts keeps that from happening.
 * Graph and Storage are separate token audiences, so each needs its own request; true means the page
 * is navigating to Microsoft and the run should not start.
 */
export async function ensureHostingConsent(account: AzureAccount, tenantId?: string): Promise<boolean> {
  const graphScopes = [...new Set([...APP_SCOPES, ...DOMAIN_SCOPES])];
  return (await ensureScopeConsent(account, graphScopes, tenantId)) || (await ensureScopeConsent(account, [...STORAGE_SCOPES], tenantId));
}

type LoadedLocations = { account: AzureAccount; subscriptionId: string; tenantId?: string; locations: AzureLocation[]; error: string | null };

// The subscription's regions; when the list fails to load, the region is typed by hand.
export function useAzureLocations({ azureAccount, subscriptionId, tenantId }: AzureTarget) {
  const [loaded, setLoaded] = useState<LoadedLocations | null>(null);
  useEffect(() => {
    if (!azureAccount || !subscriptionId) return;
    let cancelled = false;
    const settle = (locations: AzureLocation[], error: string | null) => {
      if (!cancelled) setLoaded({ account: azureAccount, subscriptionId, tenantId, locations, error });
    };
    listLocations(azureAccount, subscriptionId, tenantId).then(
      (locations) => settle(locations, null),
      (err) => settle([], err instanceof Error ? err.message : "Failed to load Azure regions")
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId]);
  const current = loaded && loaded.account === azureAccount && loaded.subscriptionId === subscriptionId && loaded.tenantId === tenantId ? loaded : null;
  return { locations: current?.locations ?? [], locationsLoading: !!azureAccount && !!subscriptionId && !current, locationsError: current?.error ?? null };
}

export interface UseCoreInfraCardParams extends AzureSpTarget {
  corpName: string;
  dnsName: string;
  variableValues: Record<string, string>;
  appOrigin: string; // This app's origin, which the site and the relay must allow.
  githubAccount: Account | null;
  githubRepo: string;
  githubRepoId: number | null;
  githubEnvName: string | null;
}

export interface UseCoreInfraCard extends CardHook {
  readonly cardId: "core_infra";
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
  infra: UseTerraformStatePart;
  createDomain: UseDomainPart;
  frontend: UseFrontendPart;
  backend: UseBackendPart;
  location: string; // One region for every part.
  setLocation: (location: string) => void;
  locations: AzureLocation[];
  locationsLoading: boolean;
  locationsError: string | null;
  provisioning: UseProvisioning; // All four parts as one task graph.
  run: () => Promise<void>;
  reset: () => void;
}

// The Private hosting environment card: four parts, one task graph, one card for App and the cards that need it.
export function useCoreInfraCard({ azureAccount, subscriptionId, tenantId, corpName, dnsName, spClientId, variableValues, appOrigin, ...github }: UseCoreInfraCardParams): UseCoreInfraCard {
  const [location, setLocation] = useState(DEFAULT_AZURE_LOCATION);
  const regions = useAzureLocations({ azureAccount, subscriptionId, tenantId });
  const target = { azureAccount, subscriptionId, tenantId, location };
  const infra = useTerraformStatePart({ ...target, corpName, spClientId, variableValues });
  const createDomain = useDomainPart({ ...target, corpName, dnsName });
  const frontend = useFrontendPart({ ...target, variableValues, allowedOrigins: [appOrigin] });
  const backend = useBackendPart({
    ...target,
    ...github,
    variableValues,
    allowedOrigins: [appOrigin, ...(dnsName ? [`https://www.${dnsName}`, `https://${dnsName}`] : [])],
  });
  const parts = [infra, createDomain, frontend, backend];
  // Shared groups and workspaces are one task each, so they are created once.
  const provisioning = useProvisioning(parts.map((part) => part.provisioning));
  const allSettled = provisioning.started && [...provisioning.plan.tasks.keys()].every((id) => isSettled(provisioning.state[id]?.status));

  // Consent first, since it can redirect away; after a failure it continues the same run, once settled it verifies all again.
  const run = async () => {
    if (!azureAccount || (await ensureHostingConsent(azureAccount, tenantId))) return;
    await provisioning.run(!provisioning.started || allSettled);
  };
  // The backend saves nothing of its own, so it has nothing to forget.
  const reset = () => {
    provisioning.reset();
    [infra, createDomain, frontend].forEach((part) => part.reset());
  };

  return {
    cardId: "core_infra" as const,
    ...hostingEnvironmentFace({
      parts,
      names: [infra.storage, frontend.siteStorage, backend.storage, backend.webPubSub, backend.functionApp],
      configured: !!AZURE_CLIENT_ID && !!azureAccount && !!subscriptionId,
      corpName,
      hosting: provisioning,
    }),
    cardRequirements: ["azure_login", "repo", "azure_subscription", "azure_app_registration"],
    cardDependencyLabel: "Set up the private hosting environment",
    infra,
    createDomain,
    frontend,
    backend,
    location,
    setLocation,
    ...regions,
    provisioning,
    run,
    reset,
  };
}

// The names the hosting card lists; an empty name is not looked up (e.g. the core names before the company code is set).
type HostingResourceNames = {
  coreGroup: string;
  coreWorkspace: string;
  stateStorage: string;
  stateContainer: string;
  dnsName: string;
  privateGroup: string;
  privateWorkspace: string;
  appInsights: string;
  siteStorage: string;
  apiStorage: string;
  webPubSub: string;
  functionApp: string;
};

type InventoryValues = {
  coreGroup?: boolean;
  coreWorkspace?: boolean;
  stateStorageGroup?: string | null;
  stateContainer?: boolean;
  dnsZone?: boolean;
  customDomain?: boolean;
  privateGroup?: boolean;
  privateWorkspace?: boolean;
  appInsights?: boolean;
  siteStorageGroup?: string | null;
  apiStorageGroup?: string | null;
  webPubSubGroup?: string | null;
  functionAppGroup?: string | null;
};
export type InventoryField = keyof InventoryValues;

// What Azure holds now. undefined is unknown (not looked up yet, or the lookup failed); a group of null means not found.
export type HostingInventory = InventoryValues & { pending: ReadonlySet<InventoryField> };

type InventoryLookup = { key: string; run: () => Promise<unknown> };

// One look-up per resource, keyed by the names it reads, so changing one name looks up only what uses it.
function inventoryLookups(account: AzureAccount, subscriptionId: string, tenantId: string | undefined, names: HostingResourceNames, scope: string): Partial<Record<InventoryField, InventoryLookup>> {
  const arm = async () => getToken(account, ARM_SCOPES, tenantId);
  const resourceExists = (resourceGroup: string, type: string, name: string, apiVersion: string) => async () =>
    armExists(await arm(), `${armResourceId(subscriptionId, resourceGroup, type, name)}?api-version=${apiVersion}`);
  const lookups: Partial<Record<InventoryField, InventoryLookup>> = {};
  const add = (field: InventoryField, inputs: string[], run: () => Promise<unknown>) => {
    if (inputs.every(Boolean)) lookups[field] = { key: [scope, field, ...inputs].join("|"), run };
  };
  const { coreGroup, coreWorkspace, stateStorage, stateContainer, dnsName, privateGroup, privateWorkspace, appInsights, siteStorage, apiStorage, webPubSub, functionApp } = names;
  add("coreGroup", [coreGroup], () => resourceGroupExists(account, subscriptionId, coreGroup, tenantId));
  add("coreWorkspace", [coreGroup, coreWorkspace], resourceExists(coreGroup, "Microsoft.OperationalInsights/workspaces", coreWorkspace, "2022-10-01"));
  add("stateStorageGroup", [stateStorage], () => findStorageAccountGroup(account, subscriptionId, stateStorage, tenantId));
  add("stateContainer", [stateStorage, stateContainer], async () => {
    const group = await findStorageAccountGroup(account, subscriptionId, stateStorage, tenantId);
    return !!group && armExists(await arm(), `${storageAccountScope(subscriptionId, group, stateStorage)}/blobServices/default/containers/${stateContainer}?api-version=2023-01-01`);
  });
  add("dnsZone", [dnsName], async () => !!(await findDnsZone(account, subscriptionId, dnsName, tenantId)));
  // Before Domain.ReadWrite.All is granted this fails, which leaves it unknown rather than missing.
  add("customDomain", [dnsName], async () => !!(await getEntraDomain(account, dnsName, tenantId)));
  add("privateGroup", [privateGroup], () => resourceGroupExists(account, subscriptionId, privateGroup, tenantId));
  add("privateWorkspace", [privateGroup, privateWorkspace], resourceExists(privateGroup, "Microsoft.OperationalInsights/workspaces", privateWorkspace, "2022-10-01"));
  add("appInsights", [privateGroup, appInsights], resourceExists(privateGroup, "Microsoft.Insights/components", appInsights, "2020-02-02"));
  add("siteStorageGroup", [siteStorage], () => findStorageAccountGroup(account, subscriptionId, siteStorage, tenantId));
  add("apiStorageGroup", [apiStorage], () => findStorageAccountGroup(account, subscriptionId, apiStorage, tenantId));
  add("webPubSubGroup", [webPubSub], () => findWebPubSubGroup(account, subscriptionId, webPubSub, tenantId));
  add("functionAppGroup", [functionApp], () => findFunctionAppGroup(account, subscriptionId, functionApp, tenantId));
  return lookups;
}

// Reads the hosting resources back from Azure; each is looked up again only when its own name or `refresh` changes.
export function useHostingInventory(target: { azureAccount: AzureAccount | null; subscriptionId: string; tenantId?: string }, names: HostingResourceNames, refresh: number): HostingInventory {
  const { azureAccount, subscriptionId, tenantId } = target;
  const [found, setFound] = useState<Record<string, { value: unknown }>>({});
  const asked = useRef(new Set<string>());
  const lookups = azureAccount && subscriptionId ? inventoryLookups(azureAccount, subscriptionId, tenantId, names, `${subscriptionId}|${tenantId}|${String(refresh)}`) : {};
  const keys = Object.values(lookups).map((lookup) => lookup.key).join("\n");

  useEffect(() => {
    if (!azureAccount || !subscriptionId) return;
    const current = inventoryLookups(azureAccount, subscriptionId, tenantId, names, `${subscriptionId}|${tenantId}|${String(refresh)}`);
    for (const lookup of Object.values(current)) {
      if (asked.current.has(lookup.key)) continue;
      asked.current.add(lookup.key);
      void lookup.run().then(
        (value) => setFound((previous) => ({ ...previous, [lookup.key]: { value } })),
        () => setFound((previous) => ({ ...previous, [lookup.key]: { value: undefined } }))
      );
    }
    // keys stands for names and refresh: it changes exactly when some look-up does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [azureAccount, subscriptionId, tenantId, keys]);

  const values: InventoryValues = {};
  const pending = new Set<InventoryField>();
  for (const [field, lookup] of Object.entries(lookups) as [InventoryField, InventoryLookup][]) {
    if (lookup.key in found) Object.assign(values, { [field]: found[lookup.key].value });
    else pending.add(field);
  }
  return { ...values, pending };
}
