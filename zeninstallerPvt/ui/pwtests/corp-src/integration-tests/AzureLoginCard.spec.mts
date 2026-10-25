/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureLogin/AzureLoginCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { restoreAzureSessionStorage } from "../util/setupHelper.mts";
import { CORP_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot, expectVisibleWithin } from "../../util/testHelper.ts";
import { expandAzureLoginCard } from "../util/cardHelper.mts";

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Sign out current user", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  await restoreAzureSessionStorage(context);
  await page.goto(CORP_URL);
  const azureCard = await expandAzureLoginCard(page);
  await expectVisibleWithin(azureCard.getByText(/Signed in as/i), "Azure signed-in status", 50_000);
  await azureCard.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(azureCard.getByText(/Signed in as/i)).toHaveCount(0);
  await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
  await expectSnapshot(page, azureCard, testInfo, "signed-out", viewportName);
  await page.reload();
  await expect(azureCard.getByText(/Signed in as/i)).toHaveCount(0);
  await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo): Promise<void> {
  const viewportName = getViewportName(testInfo);
  await page.goto(CORP_URL);

  const azureCard = await test.step("Expand Unauthenticated Azure Login Card", async () => {
    const card = await expandAzureLoginCard(page);
    await expect(card.getByRole("button", { name: "Sign in with Azure" })).toBeVisible();
    await expectSnapshot(page, card, testInfo, "start", viewportName);
    return card;
  });

  await test.step("Shows authenticated Azure card and selects a tenant", async () => {
    await restoreAzureSessionStorage(context);
    await page.reload();
    await expectVisibleWithin(azureCard.getByText(/Signed in as/i), "Azure signed-in status", 50_000);
    await expectVisibleWithin(azureCard.getByTestId("txtAzureUsername"), "Azure username", 50_000);
    await expectVisibleWithin(azureCard.getByRole("button", { name: "Sign out", exact: true }), "Sign out button", 50_000);
    await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
    await expectVisibleWithin(azureCard.getByText(/^Tenant/), "Tenant label", 50_000);
    await expectVisibleWithin(azureCard.getByRole("combobox", { name: /^Tenant\b/ }), "Stored tenant selector", 50_000);
    // Re-select the tenant to confirm its ID is selected.
    const tenantSelect = azureCard.getByTestId("tenant-select");
    await expect.poll(async () => (await tenantSelect.locator("input").inputValue()).trim(), { timeout: 50_000 }).not.toBe("");
    const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
    await tenantSelect.click();
    await page.getByRole("option").filter({ hasText: tenantId }).click();
    await expect(tenantSelect.locator("input")).toHaveValue(tenantId);
    const subscriptionCard = page.locator("#card-azure_subscription");
    const requirements = subscriptionCard.getByText("Complete these setup steps first. Select a step to open its card.");
    if (!(await requirements.isVisible())) {
      await subscriptionCard.getByText("Choose Azure subscription").click();
    }
    await expect(requirements).toBeVisible();
    await expect(subscriptionCard.getByText("Select a tenant")).toHaveCount(0, { timeout: 50_000 });
    await expectSnapshot(page, azureCard, testInfo, "end", viewportName);
  });
}
