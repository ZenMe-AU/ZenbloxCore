/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectSnapshot } from "../../util/testHelper";
import { getViewportName } from "./viewportFixture.mts";

export const signupEmail = "signup-prefill+card@example.com";

export async function expandGithubSignupCard(page: Page) {
  const card = page.locator("#card-github_signup");
  const email = card.getByRole("textbox", { name: "Email address" });
  if (!(await email.isVisible())) {
    await card.getByText("GitHub Sign Up", { exact: true }).click();
  }
  await expect(email).toBeVisible();
  return card;
}

export async function runSignupHappyPath(page: Page, testInfo: TestInfo): Promise<void> {
  const viewport = getViewportName(testInfo);
  const card = await test.step("Open the optional signup card", async () => {
    const result = await expandGithubSignupCard(page);
    await expect(result.getByText(/Complete the remaining signup steps yourself/)).toBeVisible();
    await expectSnapshot(page, result, testInfo, "start", viewport);
    return result;
  });

  await test.step("Open GitHub with an encoded email and leave signup to the user", async () => {
    await card.getByRole("textbox", { name: "Email address" }).fill(signupEmail);
    const popupPromise = page.context().waitForEvent("page");
    await card.getByRole("button", { name: "Continue to GitHub signup", exact: true }).click();
    const popup = await popupPromise;
    try {
      await popup.waitForURL("https://github.com/signup?**");
      const url = new URL(popup.url());
      expect([...url.searchParams.entries()]).toEqual([["user_email", signupEmail]]);
      await expect(popup.locator('input[type="email"]')).toHaveValue(signupEmail, { timeout: 30_000 });
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      await expect(card.getByRole("textbox", { name: "Email address" })).toHaveValue(signupEmail);
      await expect(card.locator('[data-testid="CheckCircleIcon"]')).toHaveCount(0);
      expect(new URL(page.url()).searchParams.has("user_email")).toBe(false);
      await expectSnapshot(page, card, testInfo, "end", viewport);
    } finally {
      await popup.close();
    }
  });
}