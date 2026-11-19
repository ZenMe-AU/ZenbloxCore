/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { readWrite } from "../../config/azureConfig";

// Azure permissions this card needs to assign roles to the app's service principal.
export const azureAppRegistrationAccess = (): CardResourceAccessRequest => ({
  subscription: [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"],
});
