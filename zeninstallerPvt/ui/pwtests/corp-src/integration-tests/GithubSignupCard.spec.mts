/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubSignup/GithubSignupCard.tsx
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { expectSnapshot } from "../../util/testHelper";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { expandGithubSignupCard } from "../util/cardHelper.mts";

test("Happy path", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(CORP_URL);
  await runHappyPath(page, testInfo);
});

async function runHappyPath(page: Page, testInfo: TestInfo): Promise<void> {
  const viewport = getViewportName(testInfo);
  const card = await test.step("Open the optional signup card", async () => {
    const result = await expandGithubSignupCard(page);
    await expect(result.getByText(/Complete the remaining signup steps yourself/)).toBeVisible();
    await expectSnapshot(page, result, testInfo, "start", viewport);
    return result;
  });
  await test.step("Open GitHub with an encoded email and leave signup to the user", async () => {
    const signupEmail = "signup-prefill+card@example.com";
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
      await test.step("Wait up to 60 seconds for manual GitHub signup/CAPTCHA handoff", async () => {
        console.log(
          `[GitHub signup: ${viewport}] Manual action required: complete any CAPTCHA or verification in the GitHub window yourself. ` +
          "Automation will not submit signup or bypass GitHub restrictions. Close the GitHub window within 60 seconds to resume the test. " +
          "Closing the window confirms the handoff only, not successful account creation.",
        );
        await popup.bringToFront();
        await popup.waitForEvent("close", { timeout: 60_000 });
      });
    } finally {
      if (!popup.isClosed()) await popup.close();
    }
  });
}
