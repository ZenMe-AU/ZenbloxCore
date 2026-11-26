/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { PRIVATE_RESOURCE_GROUP } from "../../logic/naming";

const RESOURCE_PROVIDERS: readonly string[] = [];
const APP_CONSENT: readonly string[] = [];
const armRoles = (functionApp: string): readonly ArmRole[] => [
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
const ENTRA_ROLES: readonly string[] = [];

// Azure permissions this card needs to deploy code to the Function App the Backend Environment card created.
export const backendDeployAccess = (functionApp: string): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: armRoles(functionApp),
  entraRoles: ENTRA_ROLES,
});
