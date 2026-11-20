/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { PRIVATE_RESOURCE_GROUP } from "../../logic/naming";

const DOCS_BASE = import.meta.env.VITE_DOCS_URL ?? "";

export const GITHUB_OAUTH_DOC = `${DOCS_BASE}/Allow_access_to_GitHub`;

// Azure permissions to read the static site storage the Private hosting environment card created.
export const webDeployAccess = (storageAccount: string): CardResourceAccessRequest => ({
  resourceGroup: PRIVATE_RESOURCE_GROUP,
  resources: [{
    type: "Microsoft.Storage/storageAccounts", api: "2023-01-01", name: storageAccount, locate: true, mustExist: true,
    actions: ["Microsoft.Storage/storageAccounts/read"],
  }],
});
