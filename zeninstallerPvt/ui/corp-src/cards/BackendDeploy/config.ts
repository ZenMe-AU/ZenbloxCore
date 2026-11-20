/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { PRIVATE_RESOURCE_GROUP } from "../../logic/naming";

// Azure permissions this card needs to deploy code to the Function App the Backend Environment card created.
export const backendDeployAccess = (functionApp: string): CardResourceAccessRequest => ({
  resourceGroup: PRIVATE_RESOURCE_GROUP,
  resources: [{
    type: "Microsoft.Web/sites", api: "2023-12-01", name: functionApp, locate: true, mustExist: true,
    actions: ["Microsoft.Web/sites/read", "Microsoft.Web/sites/publish/action", "Microsoft.Web/sites/deployments/read"],
    children: [{ path: "config/appsettings", actions: ["Microsoft.Web/sites/config/list/action", "Microsoft.Web/sites/config/write"], probe: false }],
  }],
});
