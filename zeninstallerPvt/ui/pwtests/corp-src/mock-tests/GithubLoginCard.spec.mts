/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubLogin/GithubLoginCard.tsx
import { expect, test } from "@playwright/test";
import { GITHUB_API_URL, viewports } from "../../testInit";
import { expectSnapshot } from "../../util/testHelper.ts";
import { installGithubOAuthCallback, prepareGithubLoginMock } from "../util/GithubLoginCardMockHelper.mts";
import { expandGithubLoginCard } from "../util/cardHelper.mts";
import { writeFile } from "fs/promises";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`GitHub Login Card Mock - ${viewportName}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test.beforeEach(async ({ page }) => {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    });

    test.afterEach(async ({ page }, testInfo) => {
      if (page.isClosed()) {
        return;
      }

      const entries = await page.coverage.stopJSCoverage();
      const file = testInfo.outputPath("v8-coverage.json");
      await writeFile(file, JSON.stringify(entries), "utf8");
      await testInfo.attach("v8-coverage", {
        path: file,
        contentType: "application/json",
      });
    });

    test("Happy path", async ({ page, context }, testInfo) => {
      const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
      const card = await test.step("Expand unauthenticated card", async () => {
        const result = await expandGithubLoginCard(page);
        await expectSnapshot(page, result, testInfo, "start", viewportName);
        return result;
      });

      await test.step("Submit a trimmed PAT through the login form", async () => {
        await card.getByRole("button", { name: "Direct (PAT)", exact: true }).click();
        const input = card.getByPlaceholder("ghp_… or github_pat_…");
        await input.fill("  ghp_mock  ");
        await input.press("Enter");
        await expect(card.getByText(/Authenticated as mock-user/)).toBeVisible();
        await expect(card.getByText(/PAT mode/)).toBeVisible();
        expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")))
          .toEqual({ mode: "direct", token: "ghp_mock" });
        await expectSnapshot(page, card, testInfo, "connected-pat", viewportName);
      });
      await test.step("Restore the authenticated session on reload", async () => {
        await page.reload();
        await expect(card.getByText(/Authenticated as mock-user/)).toBeVisible();
        await expectSnapshot(page, card, testInfo, "restored-pat", viewportName);
      });
      await test.step("Sign out and remain signed out after reload", async () => {
        await card.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(card.getByText(/Authenticated as/i)).toHaveCount(0);
        await expect(card.getByRole("button", { name: "Connect with PAT", exact: true })).toBeDisabled();
        expect(await page.evaluate(() => sessionStorage.getItem("zeninstaller_github_auth"))).toBeNull();
        await page.reload();
        await expect(card.getByText(/Authenticated as/i)).toHaveCount(0);
        await expect(card.getByRole("button", { name: "Login with GitHub", exact: true })).toBeVisible();
        await expectSnapshot(page, card, testInfo, "signed-out", viewportName);
      });
      expect(unexpectedRequests).toEqual([]);
    });

    test("OAuth handoff, callback, refresh and logout", async ({ page, context }, testInfo) => {
      const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
      const { exchanges, authorizations } = await installGithubOAuthCallback(page);
      const card = await expandGithubLoginCard(page);
      await card.getByRole("button", { name: "Login with GitHub", exact: true }).click();
      await expect(card.getByText(/Authenticated as mock-user/)).toBeVisible();
      await expect(card.getByText(/PAT mode/)).toHaveCount(0);
      expect(exchanges).toHaveLength(1);
      expect(authorizations).toHaveLength(1);
      await card.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect.poll(() => exchanges.length).toBe(2);
      await expect(card.getByText(/Authenticated as mock-user/)).toBeVisible();
      await card.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.reload();
      await expect(card.getByRole("button", { name: "Login with GitHub", exact: true })).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem("github_access_token"))).toBeNull();
      expect(unexpectedRequests).toEqual([]);
      await expectSnapshot(page, card, testInfo, "oauth-signed-out", viewportName);
    });

    for (const status of [401, 500]) {
      test(`Rejected PAT (${status}) can be retried`, async ({ page, context }, testInfo) => {
        const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
        let fail = true;
        let failures = 0;
        await page.route(`${GITHUB_API_URL}/user`, async (route) => {
          expect(route.request().headers().authorization).toBe(`Bearer ${fail ? "ghp_rejected_mock" : "github_pat_valid_mock"}`);
          if (fail) {
            failures++;
            return route.fulfill({ status, json: { message: status === 401 ? "Bad credentials" : "Unavailable" } });
          }
          return route.fulfill({ json: { login: "mock-user", id: 12345 } });
        });
        const card = await expandGithubLoginCard(page);
        await card.getByRole("button", { name: "Direct (PAT)", exact: true }).click();
        const input = card.getByPlaceholder("ghp_… or github_pat_…");
        await input.fill("ghp_rejected_mock");
        const failed = page.waitForEvent("console", (message) => message.type() === "error" && message.text().includes("Login failed"));
        await input.press("Enter");
        await failed;
        expect(failures).toBeGreaterThan(0);
        await expect(card.getByText(/Authenticated as/i)).toHaveCount(0);
        await expect(card.getByRole("button", { name: "Connect with PAT", exact: true })).toBeEnabled();
        fail = false;
        await input.fill("github_pat_valid_mock");
        await input.press("Enter");
        await expect(card.getByText(/Authenticated as mock-user/)).toBeVisible();
        expect(unexpectedRequests).toEqual([]);
        await expectSnapshot(page, card, testInfo, `pat-recovered-${status}`, viewportName);
      });
    }

    test("Expired stored PAT stays unauthenticated", async ({ page, context }, testInfo) => {
      const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
      await page.route(`${GITHUB_API_URL}/user`, (route) => {
        expect(route.request().headers().authorization).toBe("Bearer ghp_expired_mock");
        return route.fulfill({ status: 401, json: { message: "Expired" } });
      });
      await page.evaluate(() => sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "direct", token: "ghp_expired_mock" })));
      await page.reload();
      const card = await expandGithubLoginCard(page);
      await expect(card.getByRole("button", { name: "Connect with PAT", exact: true })).toBeEnabled();
      await expect(card.getByText(/Authenticated as/i)).toHaveCount(0);
      expect(unexpectedRequests).toEqual([]);
      await expectSnapshot(page, card, testInfo, "expired-pat", viewportName);
    });

    test("Rejects an invalid PAT", async ({ page, context }, testInfo) => {
      const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
      const card = await expandGithubLoginCard(page);
      await card.getByRole("button", { name: "Direct (PAT)", exact: true }).click();
      const input = card.getByPlaceholder("ghp_… or github_pat_…");
      await expect(card.getByRole("button", { name: "Connect with PAT", exact: true })).toBeDisabled();
      await input.fill("not-a-valid-pat");
      await card.getByRole("button", { name: "Connect with PAT", exact: true }).click();
      await expect(card.getByText(/Must be a GitHub PAT/i)).toBeVisible();
      expect(unexpectedRequests).toEqual([]);
      await expectSnapshot(page, card, testInfo, "invalid-pat", viewportName);
    });

    test("Switches from direct mode back to backend mode", async ({ page, context }, testInfo) => {
      const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
      const card = await expandGithubLoginCard(page);
      await card.getByRole("button", { name: "Direct (PAT)", exact: true }).click();
      await card.getByRole("button", { name: "Backend", exact: true }).click();
      await expect(card.getByRole("button", { name: "Login with GitHub", exact: true })).toBeVisible();
      expect(unexpectedRequests).toEqual([]);
      await expectSnapshot(page, card, testInfo, "backend-mode", viewportName);
    });

    test("Direct-only configuration supports token controls", async ({ page, context }, testInfo) => {
      const { unexpectedRequests } = await prepareGithubLoginMock(page, context, false);
      const card = await expandGithubLoginCard(page);
      await expect(card.getByRole("button", { name: "Backend", exact: true })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Login with GitHub", exact: true })).toHaveCount(0);
      const input = card.getByPlaceholder("ghp_… or github_pat_…");
      await input.fill("ghp_mock");
      await expect(input).toHaveAttribute("type", "password");
      await card.getByRole("button", { name: "Show token", exact: true }).click();
      await expect(input).toHaveAttribute("type", "text");
      await card.getByRole("button", { name: "Hide token", exact: true }).click();
      await expect(input).toHaveAttribute("type", "password");
      await input.locator("..").getByRole("button").filter({ has: page.locator('svg[data-testid="ClearIcon"]') }).click();
      await expect(input).toHaveValue("");
      await expect(card.getByRole("button", { name: "Connect with PAT", exact: true })).toBeDisabled();
      expect(unexpectedRequests).toEqual([]);
      await expectSnapshot(page, card, testInfo, "direct-only-cleared", viewportName);
    });
  });
}
