/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubSignup/GithubSignupCard.tsx
import { test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { runSignupHappyPath } from "../util/GithubSignupCardHelper.mts";

test("Happy path", async ({ page }, testInfo) => {
  await page.goto(CORP_URL);
  await runHappyPath(page, testInfo);
});

async function runHappyPath(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  await runSignupHappyPath(page, testInfo);
}