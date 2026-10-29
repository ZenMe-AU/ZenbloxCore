/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AwsLogin/AwsLoginCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { test, getViewportName } from "../util/viewportFixture.mts";
import { expectSnapshot } from "../../util/testHelper.ts";
import { installRelayNetworkGuard } from "../util/mockTestHelper.mts";
import { awsSession, installAwsApi, mockNow } from "../util/mockCardSetup.mts";
import { expandCard } from "../util/cardHelper.mts";
import { CORP_URL } from "../../testInit";

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Requires an MFA code before exchanging credentials", async ({ page, context }, testInfo) => {
  const { card, calls, unexpectedRequests } = await prepareLogin(page, context, { mfa: true });
  await card.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(card.getByRole("textbox", { name: "MFA code" })).toBeVisible();
  const verify = card.getByRole("button", { name: "Verify & sign in" });
  await expect(verify).toBeDisabled();
  expect(calls.some((call) => call.get("Action") === "GetSessionToken")).toBe(false);
  await card.getByRole("textbox", { name: "MFA code" }).fill("123456");
  await verify.click();
  await expect(card.getByRole("status")).toContainText("Signed in as mock-aws-user");
  const exchange = calls.find((call) => call.get("Action") === "GetSessionToken");
  expect(exchange?.get("SerialNumber")).toBe("arn:aws:iam::123456789012:mfa/mock-device");
  expect(exchange?.get("TokenCode")).toBe("123456");
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "mfa-signed-in", getViewportName(testInfo));
});

test("Surfaces a denied session exchange without persisting credentials", async ({ page, context }, testInfo) => {
  const { card, unexpectedRequests } = await prepareLogin(page, context, { denied: "GetSessionToken" });
  await card.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("Mock AWS permission denied");
  expect(await page.evaluate(() => sessionStorage.getItem("zeninstaller_aws_session"))).toBeNull();
  await expect(card.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "permission-denied", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo) {
  const { card, calls, unexpectedRequests } = await prepareLogin(page, context);
  const viewport = getViewportName(testInfo);
  await test.step("Exchange access keys for a temporary session", async () => {
    await expectSnapshot(page, card, testInfo, "start", viewport);
    await expect(card.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await card.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(card.getByRole("status")).toContainText("Signed in as mock-aws-user");
    expect(calls.map((call) => call.get("Action")).sort()).toEqual(["GetCallerIdentity", "GetSessionToken", "ListMFADevices"]);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("zeninstaller_aws_session")!))).toEqual(awsSession);
    await expectSnapshot(page, card, testInfo, "signed-in", viewport);
  });
  await test.step("Sign out and remove the temporary session", async () => {
    await card.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(card.getByRole("textbox", { name: "Access Key ID", exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("zeninstaller_aws_session"))).toBeNull();
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, "end", viewport);
  });
}

async function prepareLogin(page: Page, context: BrowserContext, options: { mfa?: boolean; denied?: string } = {}) {
  await page.clock.install({ time: mockNow });
  const unexpectedRequests = await installRelayNetworkGuard(context);
  const calls = await installAwsApi(page, options);
  await page.goto(CORP_URL);
  const card = page.locator("#card-aws_login");
  await expandCard(card);
  const signIn = card.getByRole("button", { name: "Sign in", exact: true });
  await expect(signIn).toBeDisabled();
  await card.getByRole("textbox", { name: "Access Key ID", exact: true }).fill("AKIA_MOCK_ONLY");
  await card.getByLabel("Secret Access Key", { exact: true }).fill("mock-long-term-secret");
  return { card, calls, unexpectedRequests };
}
