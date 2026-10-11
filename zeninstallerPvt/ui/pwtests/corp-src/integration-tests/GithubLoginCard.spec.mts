/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubLogin/GithubLoginCard.tsx
import { expect, test } from "@playwright/test";
import { getCorpGithubAuthMode, restoreGithubSessionStorage } from "../util/setupHelper.mts";
import { CORP_URL, viewports } from "../../testInit";
import { attachJSCoverage, expectSnapshot, expectVisibleWithin } from "../../util/testHelper.ts";
import { expandGithubLoginCard } from "../util/cardHelper.mts";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`GitHub Login Card - ${viewportName}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test.beforeEach(async ({ page }) => {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    });

    test.afterEach(async ({ page }, testInfo) => {
      await attachJSCoverage(page, testInfo);
    });

    test("Happy path", async ({ page, context }, testInfo) => {
      await page.goto(CORP_URL);

      const githubCard = await test.step("Expand Unauthenticated Github Login Card", async () => {
        const githubCard = await expandGithubLoginCard(page);
        await expect(githubCard.getByRole("button", { name: /^(Login with GitHub|Connect with PAT)$/ })).toBeVisible();
        await expectSnapshot(page, githubCard, testInfo, "start", viewportName);
        return githubCard;
      });

      await test.step("Shows authenticated GitHub card after login", async () => {
        await restoreGithubSessionStorage(context);
        await page.reload();

        const authMode = getCorpGithubAuthMode();
        expect(authMode).not.toBeNull();
        const githubCard = await expandGithubLoginCard(page);
        await expectVisibleWithin(githubCard.getByText(/Authenticated as/i), "GitHub authenticated status", 50_000);
        const patMode = githubCard.getByText(/· PAT mode/i);
        if (authMode === "direct") {
          await expectVisibleWithin(patMode, "PAT mode indicator", 50_000);
        } else {
          await expect(patMode).toHaveCount(0);
        }
        await expectVisibleWithin(githubCard.getByRole("button", { name: "Sign out", exact: true }), "Sign out button", 50_000);
        await expect(githubCard.getByRole("button", { name: "Login with GitHub", exact: true })).toHaveCount(0);
        await expectSnapshot(page, githubCard, testInfo, "end", viewportName);
      });
      await test.step("Sign out and keep downstream cards unauthenticated after reload", async () => {
        await githubCard.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(githubCard.getByText(/Authenticated as/i)).toHaveCount(0);
        expect(await page.evaluate(() => sessionStorage.getItem("zeninstaller_github_auth"))).toBeNull();
        await page.reload();
        await expandGithubLoginCard(page);
        await expect(githubCard.getByText(/Authenticated as/i)).toHaveCount(0);
        await expect(githubCard.getByRole("button", { name: /^(Login with GitHub|Connect with PAT)$/ })).toBeVisible();
        await expectSnapshot(page, githubCard, testInfo, "signed-out", viewportName);
      });
    });

    test("Submit a valid PAT without restoring saved authentication", async ({ page }, testInfo) => {
      await page.goto(CORP_URL);
      const card = await expandGithubLoginCard(page);
      const directMode = card.getByRole("button", { name: "Direct (PAT)", exact: true });
      if (await directMode.isVisible()) await directMode.click();
      // Playwright's enabled API logger prints fill() values; keep the real credential out of it.
      await card.getByPlaceholder("ghp_… or github_pat_…").evaluate((element, token) => {
        const input = element as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (!setter) throw new Error("Password input setter is unavailable");
        setter.call(input, token);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, process.env.GITHUB_TOKEN!);
      await card.getByRole("button", { name: "Connect with PAT", exact: true }).click();
      await expect(card.getByText(/Authenticated as/i)).toBeVisible();
      await expect(card.getByText(/PAT mode/)).toBeVisible();
      await card.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.reload();
      await expect(card.getByText(/Authenticated as/i)).toHaveCount(0);
      await expectSnapshot(page, card, testInfo, "pat-signed-out", viewportName);
    });

    test("Testing invalid PAT token in direct (PAT) mode", async ({ page }, testInfo) => {
      await page.goto(CORP_URL);
      const githubCard = await expandGithubLoginCard(page);
      const directMode = githubCard.getByRole("button", { name: "Direct (PAT)", exact: true });
      if (await directMode.isVisible()) await directMode.click();
      const patInput = githubCard.getByPlaceholder("ghp_… or github_pat_…");
      const connectWithPat = githubCard.getByRole("button", { name: "Connect with PAT", exact: true });
      await expectVisibleWithin(patInput, "GitHub PAT input", 50_000);
      await expect(connectWithPat).toBeDisabled();
      await patInput.fill("not-a-valid-pat");
      await expect(connectWithPat).toBeEnabled();
      await connectWithPat.click();
      await expectVisibleWithin(githubCard.getByText(/Must be a GitHub PAT \(ghp_… or github_pat_…\)/i), "Invalid GitHub PAT message", 50_000);
      await expectSnapshot(page, githubCard, testInfo, "invalid-pat", viewportName);
    });

    test("Can switch from Direct mode back to Backend mode", async ({ page, context }) => {
      await page.goto(CORP_URL);
      const githubCard = await expandGithubLoginCard(page);
      test.skip(await githubCard.getByRole("button", { name: "Backend", exact: true }).count() === 0, "Backend mode is not configured.");
      await githubCard.getByRole("button", { name: "Direct (PAT)", exact: true }).click();
      await expectVisibleWithin(githubCard.getByRole("button", { name: "Connect with PAT", exact: true }), "Connect with PAT button", 50_000);
      await githubCard.getByRole("button", { name: "Backend", exact: true }).click();
      await expectVisibleWithin(githubCard.getByRole("button", { name: "Login with GitHub", exact: true }), "Login with GitHub button", 50_000);
    });
  });
}
