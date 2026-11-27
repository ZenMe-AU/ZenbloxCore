/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { STORAGE_SCOPES } from "../../config/azureConfig";
import { PRIVATE_RESOURCE_GROUP } from "../../logic/naming";

const DOCS_BASE = import.meta.env.VITE_DOCS_URL ?? "";

export const GITHUB_OAUTH_DOC = `${DOCS_BASE}/Allow_access_to_GitHub`;

const RESOURCE_PROVIDERS: readonly string[] = [];
const ENTRA_ROLES: readonly string[] = [];

const backendArmRoles = (functionApp: string): readonly ArmRole[] => [
  {
    scope: { resourceGroup: PRIVATE_RESOURCE_GROUP, resource: `Microsoft.Web/sites/${functionApp}`, locate: true, mustExist: true },
    actions: ["Microsoft.Web/sites/read", "Microsoft.Web/sites/publish/action", "Microsoft.Web/sites/deployments/read"],
    children: [
      {
        path: "config/appsettings",
        actions: ["Microsoft.Web/sites/config/list/action", "Microsoft.Web/sites/config/write"],
      },
    ],
  },
];

const webArmRoles = (storageAccount: string): readonly ArmRole[] => [
  {
    scope: { resourceGroup: PRIVATE_RESOURCE_GROUP, resource: `Microsoft.Storage/storageAccounts/${storageAccount}`, locate: true, mustExist: true },
    // Reading what is live and recording the new version use the $web container's metadata; uploading writes blobs.
    actions: [
      "Microsoft.Storage/storageAccounts/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/write",
    ],
    dataActions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write"],
  },
];

// Azure permissions to deploy the site into its storage and the backend to its Function App, both created by the Private hosting environment card.
export const zeninstallerPvtAccess = (storageAccount: string, functionApp: string): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: STORAGE_SCOPES,
  armRoles: [...webArmRoles(storageAccount), ...backendArmRoles(functionApp)],
  entraRoles: ENTRA_ROLES,
});
