/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export const AWS_SSO_STACK_TITLE = "AWS console sign-in stack";

export const samlStackName = (tenantId: string) => `zeninstaller-entra-sso-${tenantId}`;

export const CREATE_STACK_URL = "https://console.aws.amazon.com/cloudformation/home#/stacks/create";

// Shared by every repo in the AWS account that ZenInstaller set up; each stack adds its repo to it.
export const GITHUB_ROLE_NAME = "zeninstaller-github";

// The stack output people save as AWS_ROLE_ARN.
export const GITHUB_ROLE_OUTPUT = "GitHubRoleArn";
