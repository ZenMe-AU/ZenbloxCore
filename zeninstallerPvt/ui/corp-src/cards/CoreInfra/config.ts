/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { APP_SCOPES, readWrite } from "../../config/azureConfig";
import { TFSTATE_CONTAINER } from "../../logic/naming";

const ROLE_ASSIGNMENTS = [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"];
const DIAGNOSTICS = readWrite("Microsoft.Insights/diagnosticSettings");

export const RESOURCE_PROVIDERS: readonly string[] = ["Microsoft.OperationalInsights", "Microsoft.Insights", "Microsoft.Storage"];
const APP_CONSENT: readonly string[] = APP_SCOPES;
const armRoles = (resourceGroup: string, workspace: string, storageAccount: string): readonly ArmRole[] => [
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
const ENTRA_ROLES: readonly string[] = [];

// Azure permissions this card needs to create its resource group, workspace and Terraform state storage.
export const coreInfraAccess = (resourceGroup: string, workspace: string, storageAccount: string): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: armRoles(resourceGroup, workspace, storageAccount),
  entraRoles: ENTRA_ROLES,
});
