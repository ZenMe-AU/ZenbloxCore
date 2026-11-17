/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { awsConsoleRoleName, awsSamlProviderName } from "../../config/awsConfig";
import { APP_SCOPES, CLAIMS_POLICY_SCOPES, GROUPS_SCOPES } from "../../config/azureConfig";

export const AWS_SSO_TITLE = "AWS single sign-on with Entra ID";

export const AWS_SSO_SCOPES = [...APP_SCOPES, ...GROUPS_SCOPES, ...CLAIMS_POLICY_SCOPES]; // All need admin consent.

// Role claim value: "<role ARN>,<SAML provider ARN>".
export const awsRoleClaim = (accountId: string, tenantId: string, access: "admin" | "readonly") =>
  `arn:aws:iam::${accountId}:role/${awsConsoleRoleName(tenantId, access)},arn:aws:iam::${accountId}:saml-provider/${awsSamlProviderName(tenantId)}`;
