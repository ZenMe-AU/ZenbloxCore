/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { PRIVATE_FRONTEND_PROVIDERS, readWrite } from "../../config/azureConfig";

const ROLE_ASSIGNMENTS = [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"];
const DIAGNOSTICS = readWrite("Microsoft.Insights/diagnosticSettings");

// Azure permissions this card needs to create the static site storage and its workspace.
export const privateFrontendInfraAccess = (resourceGroup: string, workspace: string, storageAccount: string): CardResourceAccessRequest => ({
  resourceGroup,
  createGroup: { providers: PRIVATE_FRONTEND_PROVIDERS },
  resources: [
    { type: "Microsoft.OperationalInsights/workspaces", api: "2022-10-01", name: workspace, actions: readWrite("Microsoft.OperationalInsights/workspaces") },
    {
      type: "Microsoft.Storage/storageAccounts", api: "2023-01-01", name: storageAccount, locate: true,
      actions: [...readWrite("Microsoft.Storage/storageAccounts"), ...ROLE_ASSIGNMENTS],
      whenCreating: ["Microsoft.Storage/checkNameAvailability/read"],
      children: [{ path: "blobServices/default", actions: [...readWrite("Microsoft.Storage/storageAccounts/blobServices"), ...DIAGNOSTICS] }],
    },
  ],
  subscription: DIAGNOSTICS,
});
