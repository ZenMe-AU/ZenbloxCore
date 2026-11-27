/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { APP_SCOPES, DOMAIN_SCOPES, STORAGE_SCOPES, readWrite } from "../../config/azureConfig";
import { TERMINAL_DEPLOY_CONTAINER, TERMINAL_HUB, TERMINAL_SESSION_TABLE, TFSTATE_CONTAINER } from "../../logic/naming";

const ROLE_ASSIGNMENTS = [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"];
const DIAGNOSTICS = readWrite("Microsoft.Insights/diagnosticSettings");
const NO_ENTRA_ROLES: readonly string[] = [];

// ─── Terraform state ─────────────────────────────────────────────────────────

const CORE_PROVIDERS: readonly string[] = ["Microsoft.OperationalInsights", "Microsoft.Insights", "Microsoft.Storage"];
const coreArmRoles = (resourceGroup: string, workspace: string, storageAccount: string): readonly ArmRole[] => [
  {
    scope: "subscription",
    actions: DIAGNOSTICS,
  },
  {
    scope: { resourceGroup },
    actions: ["Microsoft.Resources/subscriptions/resourceGroups/read", ...ROLE_ASSIGNMENTS],
  },
  {
    scope: { resourceGroup, resource: `Microsoft.OperationalInsights/workspaces/${workspace}` },
    actions: readWrite("Microsoft.OperationalInsights/workspaces"),
  },
  {
    scope: { resourceGroup, resource: `Microsoft.Storage/storageAccounts/${storageAccount}`, locate: true },
    createActions: ["Microsoft.Storage/checkNameAvailability/read"],
    actions: [...readWrite("Microsoft.Storage/storageAccounts"), ...ROLE_ASSIGNMENTS, ...readWrite("Microsoft.Authorization/locks")],
    children: [
      {
        path: "blobServices/default",
        actions: [...readWrite("Microsoft.Storage/storageAccounts/blobServices"), ...DIAGNOSTICS],
        children: [
          {
            path: `containers/${TFSTATE_CONTAINER}`,
            actions: readWrite("Microsoft.Storage/storageAccounts/blobServices/containers"),
          },
        ],
      },
    ],
  },
];

// Azure permissions this part needs to create its resource group, workspace and Terraform state storage.
export const coreInfraAccess = (resourceGroup: string, workspace: string, storageAccount: string): CardResourceAccessRequest => ({
  resourceProviders: CORE_PROVIDERS,
  appConsent: APP_SCOPES,
  armRoles: coreArmRoles(resourceGroup, workspace, storageAccount),
  entraRoles: NO_ENTRA_ROLES,
});

// ─── Domain ───────────────────────────────────────────────────────────────────

const DOMAIN_PROVIDERS: readonly string[] = ["Microsoft.Network", "Microsoft.OperationalInsights"];
const DOMAIN_CONSENT: readonly string[] = [...DOMAIN_SCOPES, ...APP_SCOPES];
const domainArmRoles = (resourceGroup: string, workspace: string, dnsZone: string): readonly ArmRole[] => [
  {
    scope: { resourceGroup },
    actions: ["Microsoft.Resources/subscriptions/resourceGroups/read"],
  },
  {
    scope: { resourceGroup, resource: `Microsoft.OperationalInsights/workspaces/${workspace}` },
    actions: readWrite("Microsoft.OperationalInsights/workspaces"),
  },
  {
    scope: { resourceGroup, resource: `Microsoft.Network/dnsZones/${dnsZone}` },
    actions: readWrite("Microsoft.Network/dnsZones"),
    children: [
      {
        path: "TXT/@",
        actions: readWrite("Microsoft.Network/dnsZones/TXT"),
      },
    ],
  },
];

// Azure permissions this part needs to create the DNS zone and its TXT record.
export const createDomainAccess = (resourceGroup: string, workspace: string, dnsZone: string): CardResourceAccessRequest => ({
  resourceProviders: DOMAIN_PROVIDERS,
  appConsent: DOMAIN_CONSENT,
  armRoles: domainArmRoles(resourceGroup, workspace, dnsZone),
  entraRoles: NO_ENTRA_ROLES,
});

// ─── Frontend ─────────────────────────────────────────────────────────────────

// The frontend and backend register the same providers.
const PRIVATE_PROVIDERS: readonly string[] = ["Microsoft.OperationalInsights", "Microsoft.Insights", "Microsoft.Storage", "Microsoft.SignalRService", "Microsoft.Web"];
const FRONTEND_CONSENT: readonly string[] = [...APP_SCOPES, ...STORAGE_SCOPES];
const frontendArmRoles = (resourceGroup: string, workspace: string, storageAccount: string): readonly ArmRole[] => [
  {
    scope: "subscription",
    actions: DIAGNOSTICS,
  },
  {
    scope: { resourceGroup },
    actions: ["Microsoft.Resources/subscriptions/resourceGroups/read"],
  },
  {
    scope: { resourceGroup, resource: `Microsoft.OperationalInsights/workspaces/${workspace}` },
    actions: readWrite("Microsoft.OperationalInsights/workspaces"),
  },
  {
    scope: { resourceGroup, resource: `Microsoft.Storage/storageAccounts/${storageAccount}`, locate: true },
    createActions: ["Microsoft.Storage/checkNameAvailability/read"],
    actions: [...readWrite("Microsoft.Storage/storageAccounts"), ...ROLE_ASSIGNMENTS],
    children: [
      {
        path: "blobServices/default",
        actions: [...readWrite("Microsoft.Storage/storageAccounts/blobServices"), ...DIAGNOSTICS],
      },
    ],
  },
];

// Azure permissions this part needs to create the static site storage and its workspace.
export const privateFrontendInfraAccess = (resourceGroup: string, workspace: string, storageAccount: string): CardResourceAccessRequest => ({
  resourceProviders: PRIVATE_PROVIDERS,
  appConsent: FRONTEND_CONSENT,
  armRoles: frontendArmRoles(resourceGroup, workspace, storageAccount),
  entraRoles: NO_ENTRA_ROLES,
});

// ─── Backend ──────────────────────────────────────────────────────────────────

type BackendNames = { resourceGroup: string; workspace: string; storageAccount: string; appInsights: string; webPubSub: string; functionApp: string; servicePlan: string };

const backendArmRoles = (names: BackendNames): readonly ArmRole[] => {
  const { resourceGroup } = names;
  return [
    {
      scope: { resourceGroup },
      actions: ["Microsoft.Resources/subscriptions/resourceGroups/read"],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.OperationalInsights/workspaces/${names.workspace}` },
      actions: readWrite("Microsoft.OperationalInsights/workspaces"),
    },
    {
      scope: { resourceGroup, resource: `Microsoft.Storage/storageAccounts/${names.storageAccount}`, locate: true },
      createActions: ["Microsoft.Storage/checkNameAvailability/read"],
      actions: [...readWrite("Microsoft.Storage/storageAccounts"), ...ROLE_ASSIGNMENTS],
      children: [
        {
          path: `blobServices/default/containers/${TERMINAL_DEPLOY_CONTAINER}`,
          actions: readWrite("Microsoft.Storage/storageAccounts/blobServices/containers"),
        },
        {
          path: `tableServices/default/tables/${TERMINAL_SESSION_TABLE}`,
          actions: readWrite("Microsoft.Storage/storageAccounts/tableServices/tables"),
        },
      ],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.Insights/components/${names.appInsights}` },
      actions: [...readWrite("Microsoft.Insights/components"), ...ROLE_ASSIGNMENTS],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.SignalRService/webPubSub/${names.webPubSub}`, locate: true },
      createActions: ["Microsoft.SignalRService/locations/checkNameAvailability/action"],
      actions: [...readWrite("Microsoft.SignalRService/webPubSub"), ...ROLE_ASSIGNMENTS],
      children: [
        {
          path: `hubs/${TERMINAL_HUB}`,
          actions: readWrite("Microsoft.SignalRService/webPubSub/hubs"),
        },
      ],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.Web/sites/${names.functionApp}`, locate: true },
      createActions: ["Microsoft.Web/checkNameAvailability/read"],
      actions: readWrite("Microsoft.Web/sites"),
    },
    {
      // The card puts the plan in the Function App's group.
      scope: { resourceGroup, resource: `Microsoft.Web/serverfarms/${names.servicePlan}`, locate: `Microsoft.Web/sites/${names.functionApp}` },
      actions: readWrite("Microsoft.Web/serverfarms"),
    },
  ];
};

// Azure permissions this part needs to create the backend: storage, App Insights, Web PubSub and the Function App with its plan.
export const remoteTerminalInfraAccess = (names: BackendNames): CardResourceAccessRequest => ({
  resourceProviders: PRIVATE_PROVIDERS,
  appConsent: APP_SCOPES,
  armRoles: backendArmRoles(names),
  entraRoles: NO_ENTRA_ROLES,
});
