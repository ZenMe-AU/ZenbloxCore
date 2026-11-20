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
const APP_CONSENT: readonly string[] = STORAGE_SCOPES;
const armRoles = (storageAccount: string): readonly ArmRole[] => [
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
const ENTRA_ROLES: readonly string[] = [];

// Azure permissions to deploy the static site into the storage the Private hosting environment card created.
export const webDeployAccess = (storageAccount: string): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: armRoles(storageAccount),
  entraRoles: ENTRA_ROLES,
});
