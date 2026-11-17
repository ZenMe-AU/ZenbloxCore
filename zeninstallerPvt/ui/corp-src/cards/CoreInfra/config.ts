/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { CORE_INFRA_PROVIDERS, readWrite } from "../../config/azureConfig";
import { TFSTATE_CONTAINER } from "../../logic/naming";

const ROLE_ASSIGNMENTS = [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"];
const DIAGNOSTICS = readWrite("Microsoft.Insights/diagnosticSettings");

// Azure permissions this card needs to create its resource group, workspace and Terraform state storage.
export const coreInfraAccess = (resourceGroup: string, workspace: string, storageAccount: string): CardResourceAccessRequest => ({
  resourceGroup,
  createGroup: { providers: CORE_INFRA_PROVIDERS, actions: ROLE_ASSIGNMENTS },
  resources: [
    { type: "Microsoft.OperationalInsights/workspaces", api: "2022-10-01", name: workspace, actions: readWrite("Microsoft.OperationalInsights/workspaces") },
    {
      type: "Microsoft.Storage/storageAccounts", api: "2023-01-01", name: storageAccount, locate: true,
      actions: [...readWrite("Microsoft.Storage/storageAccounts"), ...ROLE_ASSIGNMENTS, ...readWrite("Microsoft.Authorization/locks")],
      whenCreating: ["Microsoft.Storage/checkNameAvailability/read"],
      children: [
        { path: "blobServices/default", actions: [...readWrite("Microsoft.Storage/storageAccounts/blobServices"), ...DIAGNOSTICS] },
        { path: `blobServices/default/containers/${TFSTATE_CONTAINER}`, actions: readWrite("Microsoft.Storage/storageAccounts/blobServices/containers") },
      ],
    },
  ],
  subscription: DIAGNOSTICS,
});
