/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { APP_SCOPES, STORAGE_SCOPES, readWrite } from "../../config/azureConfig";

const ROLE_ASSIGNMENTS = [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"];
const DIAGNOSTICS = readWrite("Microsoft.Insights/diagnosticSettings");

export const RESOURCE_PROVIDERS: readonly string[] = [
  "Microsoft.OperationalInsights",
  "Microsoft.Insights",
  "Microsoft.Storage",
  "Microsoft.SignalRService",
  "Microsoft.Web",
];
const APP_CONSENT: readonly string[] = [...APP_SCOPES, ...STORAGE_SCOPES];
const armRoles = (resourceGroup: string, workspace: string, storageAccount: string): readonly ArmRole[] => [
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
const ENTRA_ROLES: readonly string[] = [];

// Azure permissions this card needs to create the static site storage and its workspace.
export const privateFrontendInfraAccess = (resourceGroup: string, workspace: string, storageAccount: string): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: armRoles(resourceGroup, workspace, storageAccount),
  entraRoles: ENTRA_ROLES,
});
