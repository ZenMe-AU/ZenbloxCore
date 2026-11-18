/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { samlStackTemplate } from "../cards/AwsSsoStack/samlStackTemplate";

it("trusts just the repo's subjects for GitHub Actions and only SAML for the console roles", () => {
  const subjects = ["repo:o@1/r@2:environment:PROD", "repo:o@1/r@2:environment:TEST"];
  const template = samlStackTemplate("tid", "CERT", subjects);
  expect(template).toContain(`Subjects: ${JSON.stringify(subjects)}`);
  expect(template.match(/sts:AssumeRoleWithSAML/g)).toHaveLength(2);
  expect(template).not.toMatch(/cognito/i);
});
