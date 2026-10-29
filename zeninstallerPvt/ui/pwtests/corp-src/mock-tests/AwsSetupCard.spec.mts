/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AwsSetup/AwsSetupCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { test, getViewportName } from "../util/viewportFixture.mts";
import { expectSnapshot } from "../../util/testHelper.ts";
import { awsRoleArn, installAwsApi, prepareCardMocks } from "../util/mockCardSetup.mts";

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Does not save connection details when IAM denies role creation", async ({ page, context }, testInfo) => {
  const setup = await prepareCardMocks(page, context, { AWS_ROLE_ARN: "" }, { aws: true });
  const calls = await installAwsApi(page, { denied: "CreateRole" });
  const card = await setup.open("aws_setup");
  await expect(card.getByRole("button", { name: "Create IAM Role", exact: true })).toBeEnabled();
  await card.getByRole("button", { name: "Create IAM Role", exact: true }).click();
  await expect(card.getByText("Mock AWS permission denied", { exact: true }).first()).toBeVisible();
  expect(setup.github.variables.AWS_ROLE_ARN).toBe("");
  expect(calls.map((call) => call.get("Action"))).toEqual(["CreateOpenIDConnectProvider", "CreateRole"]);
  expect(setup.unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "role-denied", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo) {
  const setup = await prepareCardMocks(page, context, { AWS_ROLE_ARN: "" }, { aws: true });
  const calls = await installAwsApi(page);
  const card = await setup.open("aws_setup");
  const viewport = getViewportName(testInfo);
  await test.step("Create the GitHub identity provider and IAM role", async () => {
    await expect(card.getByRole("textbox", { name: "IAM role name" })).toHaveValue("zeninstaller-github");
    await expect(card.getByRole("button", { name: "Create IAM Role", exact: true })).toBeEnabled();
    await expectSnapshot(page, card, testInfo, "start", viewport);
    await card.getByRole("button", { name: "Create IAM Role", exact: true }).click();
    await expect(card.getByText("Connection details saved.", { exact: true })).toBeVisible();
    expect(calls.map((call) => call.get("Action"))).toEqual(["CreateOpenIDConnectProvider", "CreateRole", "AttachRolePolicy"]);
    const role = calls.find((call) => call.get("Action") === "CreateRole");
    expect(JSON.parse(role!.get("AssumeRolePolicyDocument")!)).toEqual({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Federated: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
            StringLike: { "token.actions.githubusercontent.com:sub": [`repo:mock-user@12345/${setup.repoName}@987654321:environment:PROD`] },
          },
        },
      ],
    });
    expect(calls.find((call) => call.get("Action") === "AttachRolePolicy")?.get("PolicyArn")).toBe("arn:aws:iam::aws:policy/AdministratorAccess");
    await expectSnapshot(page, card, testInfo, "role-created", viewport);
  });
  await test.step("Read back the saved environment connection", async () => {
    await expect.poll(() => setup.github.variables.AWS_ROLE_ARN).toBe(awsRoleArn);
    await expect(card.locator("h3")).toContainText("Complete");
    expect(setup.unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, "end", viewport);
  });
}
