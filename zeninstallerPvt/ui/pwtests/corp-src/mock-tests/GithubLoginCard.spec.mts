/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubLogin/GithubLoginCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { GITHUB_API_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import { installGithubOAuthCallback, prepareGithubLoginMock } from "../util/mockTestHelper.mts";
import { expandGithubLoginCard } from "../util/cardHelper.mts";

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Backend Github Log In", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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

test("Expired stored PAT stays unauthenticated", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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
  const viewportName = getViewportName(testInfo);
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


async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  const viewportName = getViewportName(testInfo);
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
}
