/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { APP_SCOPES, readWrite } from "../../config/azureConfig";

const RESOURCE_PROVIDERS: readonly string[] = [];
const APP_CONSENT: readonly string[] = APP_SCOPES;
const ARM_ROLES: readonly ArmRole[] = [
  {
    scope: "subscription",
    actions: [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"],
  },
];

const ENTRA_ROLES: readonly string[] = [
  "microsoft.directory/applications/create",
  "microsoft.directory/servicePrincipals/create",
  "microsoft.directory/applications/credentials/update",
];

// Azure permissions this card needs to assign roles to the app's service principal.
export const azureAppRegistrationAccess = (): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: ARM_ROLES,
  entraRoles: ENTRA_ROLES,
});
