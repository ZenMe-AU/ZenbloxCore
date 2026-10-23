/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubSignup/GithubSignupCard.tsx
import { test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { attachJSCoverage } from "../../util/testHelper";
import { runSignupHappyPath } from "../util/GithubSignupCardHelper.mts";

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page }, testInfo) => {
  await page.goto(CORP_URL);
  await runHappyPath(page, testInfo);
});

async function runHappyPath(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  await runSignupHappyPath(page, testInfo);
}