/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureSubscription/AzureSubscriptionCard.tsx
import { test, expect } from "@playwright/test";
import { CORP_URL } from "../../testInit";
import { createNewRepo } from "../util/testHelper.mts";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import {
  installMockAzure,
  installMockGitHub,
  mockSecondSubscriptionId,
  mockSecondTenantId,
  mockSubscriptionId,
  mockTenantId,
  prepareMockAzureSubscription,
  savedAzureVariables,
  signInMockAzure,
} from "../util/mockTestHelper.mts";
import { expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard } from "../util/cardHelper.mts";

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Selecting an existing repository with environment variables already saved", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const result = await prepareMockAzureSubscription(page, context, `mock-existing-subscription-${viewportName.toLowerCase()}`, {
    initialVariables: savedAzureVariables,
    existingRepository: true,
  });
  await expect(result.tenantVariableInput).not.toHaveValue("");
  await expect(result.subscriptionVariableInput).not.toHaveValue("");
  await expect(result.azureSubscriptionCard.getByText("Unsaved change — save to apply.", { exact: true })).toHaveCount(0);
  await expect(result.saveButton).toBeDisabled();
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "edge-case-existing-repo", viewportName);
});

test("Modifying one existing prefilled variable", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const result = await prepareMockAzureSubscription(page, context, `mock-modify-one-${viewportName.toLowerCase()}`, {
    initialVariables: savedAzureVariables,
  });
  const savedSubscriptionId = await result.subscriptionVariableInput.inputValue();
  await result.subscriptionVariableInput.fill(`${savedSubscriptionId}-modified`);
  await expect(result.azureSubscriptionCard.getByRole("button", { name: "Save 1 variable" })).toBeEnabled();
  await expect(result.azureSubscriptionCard.getByText("overwrites", { exact: true })).toBeVisible();
  await result.azureSubscriptionCard.getByRole("button", { name: "Revert to saved value" }).click();
  await expect(result.subscriptionVariableInput).toHaveValue(savedSubscriptionId);
  await expect(result.saveButton).toBeDisabled();
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "edge-case-variable-modified", viewportName);
});

test("Modifying all existing prefilled variables", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const result = await prepareMockAzureSubscription(page, context, `mock-modify-all-${viewportName.toLowerCase()}`, {
    initialVariables: savedAzureVariables,
  });
  const savedTenantId = await result.tenantVariableInput.inputValue();
  const savedSubscriptionId = await result.subscriptionVariableInput.inputValue();
  await result.tenantVariableInput.fill("modified");
  await result.subscriptionVariableInput.fill("modified");
  await expect(result.azureSubscriptionCard.getByText("overwrites", { exact: true })).toHaveCount(2);
  for (const key of ["AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID"]) {
    await result.azureSubscriptionCard
      .getByText(key, { exact: true })
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "Revert to saved value" })
      .click();
  }
  await expect(result.tenantVariableInput).toHaveValue(savedTenantId);
  await expect(result.subscriptionVariableInput).toHaveValue(savedSubscriptionId);
  await expect(result.saveButton).toBeDisabled();
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "edge-case-both-variables-modified", viewportName);
});

test("Both prefilled variables are removed before saving", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const result = await prepareMockAzureSubscription(page, context, `mock-remove-all-${viewportName.toLowerCase()}`, {
    initialVariables: savedAzureVariables,
  });
  await result.tenantVariableInput.fill("");
  await result.subscriptionVariableInput.fill("");
  const removeButton = result.azureSubscriptionCard.getByRole("button", { name: "Save 2 variables" });
  await expect(removeButton).toBeEnabled();
  await removeButton.click();
  await expect(result.tenantVariableInput).toHaveValue("");
  await expect(result.subscriptionVariableInput).toHaveValue("");
  await expect(result.azureSubscriptionCard.getByText("2 not configured", { exact: true })).toBeVisible();
  await expect(result.github.variables).toEqual({ VITE_AZURE_TENANT_ID: mockTenantId });
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "edge-case-both-variables-removed", viewportName);
});

test("Subscription loading errors and no-access states are explicit", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  test.setTimeout(120_000);
  const result = await prepareMockAzureSubscription(page, context, `mock-subscription-no-access-${viewportName.toLowerCase()}`, {
    tenantIds: [mockTenantId, mockSecondTenantId],
    initialAzureState: {
      tenants: [
        { tenantId: mockTenantId, displayName: "Mock tenant" },
        { tenantId: mockSecondTenantId, displayName: "Mock second tenant" },
      ],
      subscriptions: [
        { subscriptionId: mockSubscriptionId, displayName: "Mock subscription", tenantId: mockTenantId, state: "Enabled" },
      ],
    },
  });
  const tenantSelect = result.azureLoginCard.getByTestId("tenant-select");
  await tenantSelect.click();
  await page.getByRole("option", { name: /Mock second tenant/ }).click();
  await expect(result.azureSubscriptionCard.getByText("This tenant has no subscriptions you can access.", { exact: true })).toBeVisible();
  await expect(result.azureSubscriptionCard.getByRole("combobox")).toHaveCount(0);
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "no-subscription-access", viewportName);
});

test("Switching tenants resets the selection and subscription list", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const result = await prepareMockAzureSubscription(page, context, `mock-subscription-switch-${viewportName.toLowerCase()}`, {
    initialVariables: savedAzureVariables,
    tenantIds: [mockTenantId, mockSecondTenantId],
    initialAzureState: {
      tenants: [
        { tenantId: mockTenantId, displayName: "Mock tenant" },
        { tenantId: mockSecondTenantId, displayName: "Mock second tenant" },
      ],
      subscriptions: [
        { subscriptionId: mockSubscriptionId, displayName: "Mock subscription", tenantId: mockTenantId, state: "Enabled" },
        { subscriptionId: mockSecondSubscriptionId, displayName: "Mock second subscription", tenantId: mockSecondTenantId, state: "Enabled" },
      ],
    },
  });
  const tenantSelect = result.azureLoginCard.getByTestId("tenant-select");
  await expect(result.azureLoginCard.getByText("Loading tenants...", { exact: true })).toBeHidden();
  await tenantSelect.click();
  await page.getByRole("option", { name: /Mock second tenant/ }).click();
  await expect(tenantSelect.locator("input")).toHaveValue(mockSecondTenantId);
  const subscriptionSelect = result.azureSubscriptionCard.getByRole("combobox");
  await expect(subscriptionSelect).toContainText("Mock second subscription");
  await expect(result.subscriptionVariableInput).toHaveValue(mockSecondSubscriptionId);
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "tenant-switch-subscription", viewportName);
});

test("URL subscription selection takes precedence over the saved subscription", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const result = await prepareMockAzureSubscription(page, context, `mock-subscription-url-${viewportName.toLowerCase()}`, {
    initialVariables: savedAzureVariables,
    url: `${CORP_URL}?subscription=${mockSecondSubscriptionId}`,
    initialAzureState: {
      subscriptions: [
        { subscriptionId: mockSubscriptionId, displayName: "Mock subscription", tenantId: mockTenantId, state: "Enabled" },
        { subscriptionId: mockSecondSubscriptionId, displayName: "Mock second subscription", tenantId: mockTenantId, state: "Enabled" },
      ],
    },
  });
  await expect(result.azureSubscriptionCard.getByRole("combobox")).toContainText("Mock second subscription");
  await expect(result.subscriptionVariableInput).toHaveValue(mockSubscriptionId);
  await expect(result.azureSubscriptionCard.getByText("Unsaved change — save to apply.", { exact: true })).toBeVisible();
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "url-selection-precedence", viewportName);
});

test("Failed variable writes preserve the successful keys and allow retry", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const result = await prepareMockAzureSubscription(page, context, `mock-subscription-save-error-${viewportName.toLowerCase()}`, {
    existingRepository: true,
  });
  let failedOneWrite = false;
  await page.route("https://api.github.com/repos/**/environments/PROD/variables", async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON().name !== "VITE_AZURE_TENANT_ID" ||
      failedOneWrite
    ) {
      await route.fallback();
      return;
    }
    failedOneWrite = true;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "mock write failure" }) });
  });
  const saveButton = result.azureSubscriptionCard.getByRole("button", { name: "Save 3 variables" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect.poll(() => Object.keys(result.github.variables).length).toBe(2);
  expect(Object.keys(result.github.variables)).not.toContain("VITE_AZURE_TENANT_ID");
  const retryButton = result.azureSubscriptionCard.getByRole("button", { name: /^Save 1 variable$/ });
  await expect(retryButton).toBeEnabled();
  await retryButton.click();
  await expect.poll(() => result.github.variables).toEqual({
    AZURE_TENANT_ID: mockTenantId,
    AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
    VITE_AZURE_TENANT_ID: mockTenantId,
  });
  await page.reload();
  const reloadedCard = await expandAzureSubscriptionCard(page);
  await expect(reloadedCard.getByText("AZURE_TENANT_ID", { exact: true }).locator("..").locator("..").getByRole("textbox")).toHaveValue(mockTenantId);
  await expect(reloadedCard.getByText("AZURE_SUBSCRIPTION_ID", { exact: true }).locator("..").locator("..").getByRole("textbox")).toHaveValue(mockSubscriptionId);
  await expectSnapshot(page, reloadedCard, testInfo, "variables-persist-after-retry", viewportName);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  const viewportName = testInfo.project.name;
  const github = await installMockGitHub(page, context);
  await installMockAzure(page);
  await page.goto(CORP_URL);

  const azureCard = await test.step("Expand Azure Login Card", async () => {
    const card = await expandAzureLoginCard(page);
    await signInMockAzure(page);
    await expect(card.getByText(/Signed in as/i)).toBeVisible();
    return card;
  });

  const azureSubscriptionCard = await test.step("Expand Azure Subscription Card", async () => {
    const card = await expandAzureSubscriptionCard(page);
    await expectSnapshot(page, card, testInfo, "start", viewportName);
    return card;
  });

  await test.step("Select tenant", async () => {
    const tenantSelect = azureCard.getByTestId("tenant-select");
    await expect(tenantSelect).toBeVisible();
    await tenantSelect.click();
    await page.getByRole("option", { name: /Mock tenant/i }).click();
    await expect(azureSubscriptionCard.getByText("Select a tenant", { exact: true })).toHaveCount(0);
    await expectSnapshot(page, azureSubscriptionCard, testInfo, "tenant-selected", viewportName);
  });

  const repoCard = await test.step("Expand repo card", async () => {
    const card = await expandRepoCard(page);
    await expectSnapshot(page, azureSubscriptionCard, testInfo, "repo-card-expanded", viewportName);
    return card;
  });

  await test.step("Clone repository", async () => {
    await createNewRepo(page, repoCard, `mock-azure-subscription-${viewportName.toLowerCase()}`);
    await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
    const prodEnvironment = repoCard.getByText("PROD", { exact: true });
    await expect(prodEnvironment).toBeVisible();
    await prodEnvironment.click();
    await expectSnapshot(page, azureSubscriptionCard, testInfo, "clone-repo", viewportName);
  });

  await test.step("Repo create environment", async () => {
    const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
    if (await createProdButton.isVisible()) {
      await createProdButton.click();
      await expect(createProdButton).toBeHidden();
    }
    await expectSnapshot(page, azureSubscriptionCard, testInfo, "create-env", viewportName);
  });

  await test.step("Saving prefilled Azure subscription variables", async () => {
    await expect(azureSubscriptionCard.getByText("Loading subscriptions...")).toBeHidden();
    const subscriptionSelect = azureSubscriptionCard.getByRole("combobox");
    await expect(subscriptionSelect).toBeVisible();
    await subscriptionSelect.click();
    const subscriptionOption = page.getByRole("option").filter({ hasText: mockSubscriptionId });
    await expect(subscriptionOption).toBeVisible();
    await subscriptionOption.click();
    await expect(subscriptionSelect).toContainText("Mock subscription");
    const saveButton = azureSubscriptionCard.getByRole("button", { name: "Save 3 variables" });
    await expectSnapshot(page, azureSubscriptionCard, testInfo, "before-save", viewportName);
    await saveButton.click();
    await expect(azureSubscriptionCard.getByRole("button", { name: "Save variables" })).toBeDisabled();
    expect(savedAzureVariables).toEqual({
      AZURE_TENANT_ID: mockTenantId,
      AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
      VITE_AZURE_TENANT_ID: mockTenantId,
    });
    await expect.poll(() => github.variables).toEqual(savedAzureVariables);
    await expectSnapshot(page, azureSubscriptionCard, testInfo, "end", viewportName);
    await page.reload();
    const persistedCard = await expandAzureSubscriptionCard(page);
    await expect(persistedCard.getByText("AZURE_TENANT_ID", { exact: true }).locator("..").locator("..").getByRole("textbox")).toHaveValue(mockTenantId);
    await expect(persistedCard.getByText("AZURE_SUBSCRIPTION_ID", { exact: true }).locator("..").locator("..").getByRole("textbox")).toHaveValue(mockSubscriptionId);
    await expect(persistedCard.getByRole("button", { name: "Save variables" })).toBeDisabled();
    await expectSnapshot(page, persistedCard, testInfo, "persisted-after-reload", viewportName);
  });
}
