/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureSubscription/AzureSubscriptionCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import {
  installMockAzure,
  installMockGitHub,
  mockSecondSubscriptionId,
  mockSecondTenantId,
  mockSubscriptionId,
  mockTenantId,
  savedAzureVariables,
  type MockAzureState,
} from "../util/mockTestHelper.mts";
import { expandAzureLoginCard, expandAzureSubscriptionCard } from "../util/cardHelper.mts";

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Modifying existing variables", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  const result = await prepareMockAzureSubscription(page, context, `mock-modify-prefilled-${viewportName.toLowerCase()}`, {
    initialVariables: savedAzureVariables,
  });
  const savedSubscriptionId = await result.subscriptionVariableInput.inputValue();
  await result.subscriptionVariableInput.fill(`${savedSubscriptionId}-modified`);
  await expect(result.azureSubscriptionCard.getByRole("button", { name: "Save 1 variable" })).toBeEnabled();
  await expect(result.azureSubscriptionCard.getByText("overwrites", { exact: true })).toBeVisible();
  await result.azureSubscriptionCard.getByRole("button", { name: /^Revert .+ to saved value$/ }).click();
  await expect(result.subscriptionVariableInput).toHaveValue(savedSubscriptionId);
  await expect(result.saveButton).toBeDisabled();
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "edge-case-variable-modified", viewportName);
  const savedTenantId = await result.tenantVariableInput.inputValue();
  await result.tenantVariableInput.fill("modified");
  await result.subscriptionVariableInput.fill("modified");
  await expect(result.azureSubscriptionCard.getByText("overwrites", { exact: true })).toHaveCount(2);
  for (const key of ["AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID"]) {
    await result.azureSubscriptionCard
      .getByText(key, { exact: true })
      .locator("..")
      .locator("..")
      .getByRole("button", { name: /^Revert .+ to saved value$/ })
      .click();
  }
  await expect(result.tenantVariableInput).toHaveValue(savedTenantId);
  await expect(result.subscriptionVariableInput).toHaveValue(savedSubscriptionId);
  await expect(result.saveButton).toBeDisabled();
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "edge-case-both-variables-modified", viewportName);
});

test("Removing existing variables", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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

test("No subscriptions for tenant", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  test.setTimeout(120_000);
  const result = await prepareMockAzureSubscription(page, context, `mock-subscription-no-access-${viewportName.toLowerCase()}`, {
    tenantId: mockSecondTenantId,
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
  await expect(result.azureSubscriptionCard.getByText("This tenant has no subscriptions you can access.", { exact: true })).toBeVisible();
  await expect(result.azureSubscriptionCard.getByRole("combobox")).toHaveCount(0);
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "no-subscription-access", viewportName);
});

test("Switching tenants resets subscription list", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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
  const azureLoginCard = await expandAzureLoginCard(page);
  const tenantSelect = azureLoginCard.getByTestId("tenant-select");
  await expect(azureLoginCard.getByText("Loading tenants...", { exact: true })).toBeHidden();
  await tenantSelect.click();
  await page.getByRole("option", { name: /Mock second tenant/ }).click();
  await expect(tenantSelect.locator("input")).toHaveValue(mockSecondTenantId);
  const subscriptionSelect = result.azureSubscriptionCard.getByRole("combobox");
  await expect(subscriptionSelect).toContainText("Mock second subscription");
  await expect(result.subscriptionVariableInput).toHaveValue(mockSecondSubscriptionId);
  await expectSnapshot(page, result.azureSubscriptionCard, testInfo, "tenant-switch-subscription", viewportName);
});

test("Failed variable writes allow retry", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  const result = await prepareMockAzureSubscription(page, context, `mock-subscription-save-error-${viewportName.toLowerCase()}`);
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
  const viewportName = getViewportName(testInfo);
  const { github, azureSubscriptionCard } = await prepareMockAzureSubscription(
    page, context, `mock-azure-subscription-${viewportName.toLowerCase()}`,
  );

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

async function prepareMockAzureSubscription(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  repoName: string,
  options: {
    initialVariables?: Record<string, string>;
    initialAzureState?: Partial<MockAzureState>;
    tenantIds?: string[];
    tenantId?: string;
  } = {},
) {
  const tenantId = options.tenantId ?? mockTenantId;
  const tenantIds = options.tenantIds ?? [tenantId];
  const github = await installMockGitHub(page, context, {
    repositoryName: repoName,
    branches: ["main", "PROD"],
    initialVariables: options.initialVariables,
  });
  const azure = await installMockAzure(page, options.initialAzureState);
  await context.addInitScript((id) => {
    sessionStorage.setItem("zeninstaller_arm_tenant", id);
  }, tenantId);
  await page.route(/\/corp-src\/auth\/msal\.ts(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
      export const PINNED_TENANT_ID = undefined;
      export const LOGIN_AUTHORITY = "https://login.microsoftonline.com/common";
      export const cleanTenantId = tenant => tenant?.trim().toLowerCase();
      const account = { homeAccountId: "mock-home", environment: "login.microsoftonline.com",
        tenantId: ${JSON.stringify(tenantId)}, localAccountId: "mock-user", username: "mock-user@example.com",
        name: "Mock Azure User", tenantProfiles: new Map(${JSON.stringify(tenantIds)}.map(id => [id, {}])) };
      const reject = async () => { throw new Error("Unexpected authentication redirect in subscription mock"); };
      export const getMsal = async () => ({ handleRedirectPromise: async () => null,
        getAllAccounts: () => [account], acquireTokenSilent: async () => ({ account, accessToken: "mock-token" }),
        loginRedirect: reject, acquireTokenRedirect: reject, clearCache: async () => {} });
      export const ensureScopeConsent = async () => false;
      export const getToken = async () => "mock-token";
      export const setActiveAzureIdentity = () => {};
      export const getMsToken = async () => "mock-token";
      export const requireMsToken = async () => "mock-token";
    `,
  }));
  const url = new URL(CORP_URL);
  url.search = new URLSearchParams({ account: "mock-user", repo: repoName, env: "PROD", tenant: tenantId }).toString();
  await page.goto(url.toString());
  const azureSubscriptionCard = await expandAzureSubscriptionCard(page);
  await expect(azureSubscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden();
  await expect(azureSubscriptionCard.getByRole("combobox").or(
    azureSubscriptionCard.getByText("This tenant has no subscriptions you can access.", { exact: true }),
  )).toBeVisible();
  const tenantVariableInput = azureSubscriptionCard.getByText("AZURE_TENANT_ID", { exact: true }).locator("../..").getByRole("textbox");
  const subscriptionVariableInput = azureSubscriptionCard.getByText("AZURE_SUBSCRIPTION_ID", { exact: true }).locator("../..").getByRole("textbox");
  return {
    github, azure, azureSubscriptionCard, tenantVariableInput, subscriptionVariableInput,
    saveButton: azureSubscriptionCard.getByRole("button", { name: "Save variables", exact: true }),
  };
}
