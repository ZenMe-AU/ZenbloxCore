/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/GithubSignup/GithubSignupCard.tsx
import { type BrowserContext, expect, type Page, type TestInfo } from "@playwright/test";
import { getViewportName, test } from "../../../../../.playwright/viewportFixture.mjs";
import { expectSnapshot } from "../../../../../.playwright/testHelper.js";
import { prepareGithubLoginMock } from "../util/mockTestHelper.mts";
import { expandGithubSignupCard } from "../util/cardHelper.mts";

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Empty and malformed emails cannot open signup", async ({ page, context }, testInfo) => {
  const signupEmail = "signup-prefill+card@example.com";
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
  const continueButton = card.getByRole("button", { name: "Continue to GitHub signup", exact: true });
  await expect(continueButton).toHaveCSS("align-self", "flex-start");
  await continueButton.click();
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
  const signupEmail = "signup-prefill+card@example.com";
  const { unexpectedRequests } = await prepareGithubLoginMock(page, context);
  const card = await expandGithubSignupCard(page);
  await card.getByRole("textbox", { name: "Email address" }).fill(signupEmail);
  const signInLink = card.getByRole("button", { name: "Already have an account? Sign in to GitHub", exact: true });
  await expect(signInLink).toHaveCSS("font-size", "16px");
  await expect(signInLink).toHaveCSS("text-decoration-line", "none");
  await signInLink.click();
  const login = page.locator("#card-github_login");
  await expect(login.getByText(/Connect your GitHub account so ZenInstaller/)).toBeVisible();
  await page.reload();
  await expect(card.getByRole("textbox", { name: "Email address" })).toHaveValue("");
  await expect(login.getByText(/Connect your GitHub account so ZenInstaller/)).toBeVisible();
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "existing-account", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo): Promise<void> {
  const signupEmail = "signup-prefill+card@example.com";
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
    } finally {
      await popup.close();
    }
  });
  expect(signupRequests).toHaveLength(1);
  expect(unexpectedRequests).toEqual([]);
}