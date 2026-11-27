/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import { ACCESS_PASS_SCOPES } from "../config/azureConfig";
import { accessPassAccess } from "../cards/AccessPass/config";

describe("accessPassAccess", () => {
  it("declares the Graph consent and Entra actions used by the card", () => {
    expect(accessPassAccess()).toEqual({
      resourceProviders: [],
      appConsent: ACCESS_PASS_SCOPES,
      armRoles: [],
      entraRoles: [
        "microsoft.directory/userCredentialPolicies/basic/update",
        "microsoft.directory/users/authenticationMethods/create",
        "microsoft.directory/users/authenticationMethods/delete",
        "microsoft.directory/users/password/update",
      ],
    });
  });
});
