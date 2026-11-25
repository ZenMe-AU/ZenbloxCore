/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { ACCESS_PASS_SCOPES } from "../../config/azureConfig";
import type { CardResourceAccessRequest } from "../../types";

const ENTRA_ROLES: readonly string[] = [
  "microsoft.directory/userCredentialPolicies/basic/update",
  "microsoft.directory/users/authenticationMethods/create",
  "microsoft.directory/users/authenticationMethods/delete",
  "microsoft.directory/users/password/update",
];

export const accessPassAccess = (): CardResourceAccessRequest => ({
  resourceProviders: [],
  appConsent: ACCESS_PASS_SCOPES,
  armRoles: [],
  entraRoles: ENTRA_ROLES,
});
