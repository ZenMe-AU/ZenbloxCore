/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubSignup/GithubSignupCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper";
import { prepareGithubLoginMock } from "../util/mockTestHelper.mts";
import { expandGithubSignupCard, runSignupHappyPath, signupEmail } from "../util/GithubSignupCardHelper.mts";

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Empty and malformed emails cannot open signup", async ({ page, context }, testInfo) => {
  const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
  const card = await expandGithubSignupCard(page);
  const email = card.getByRole("textbox", { name: "Email address" });
  const pagesBefore = context.pages().length;
  await card.locator("form").evaluate((form) => {
    form.dataset.submissions = "0";
    form.addEventListener("submit", () => {
      form.dataset.submissions = String(Number(form.dataset.submissions) + 1);
    });
  });
  await card.getByRole("button", { name: "Continue to GitHub signup", exact: true }).click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await email.fill("not-an-email");
  await email.press("Enter");
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
  await expect(card.locator("form")).toHaveAttribute("data-submissions", "0");
  expect(context.pages()).toHaveLength(pagesBefore);
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "invalid-email", getViewportName(testInfo));
});

test("Existing users can go straight to login without saving an email", async ({ page, context }, testInfo) => {
  const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
  const card = await expandGithubSignupCard(page);
  await card.getByRole("textbox", { name: "Email address" }).fill(signupEmail);
  await card.getByRole("button", { name: "Already have an account? Sign in to GitHub", exact: true }).click();
  const login = page.locator("#card-github_login");
  await expect(login.getByText(/Connect your GitHub account so ZenInstaller/)).toBeVisible();
  await page.reload();
  await expect(card.getByRole("textbox", { name: "Email address" })).toHaveValue("");
  await expect(login.getByText(/Connect your GitHub account so ZenInstaller/)).toBeVisible();
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "existing-account", getViewportName(testInfo));
});

async function runHappyPath(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  testInfo: import("@playwright/test").TestInfo,
): Promise<void> {
  const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
  const signupRequests: string[] = [];
  await context.route("https://github.com/signup?**", async (route) => {
    expect(route.request().method()).toBe("GET");
    const url = new URL(route.request().url());
    expect([...url.searchParams.entries()]).toEqual([["user_email", signupEmail]]);
    signupRequests.push(route.request().url());
    // A deterministic handoff fixture, not evidence of GitHub's live contract.
    await route.fulfill({
      contentType: "text/html",
      body: `<label>Email <input type="email" name="email" value="${signupEmail}"></label><label>Password <input type="password"></label>`,
    });
  });
  await runSignupHappyPath(page, testInfo);
  expect(signupRequests).toHaveLength(1);
  expect(unexpectedRequests).toEqual([]);
}