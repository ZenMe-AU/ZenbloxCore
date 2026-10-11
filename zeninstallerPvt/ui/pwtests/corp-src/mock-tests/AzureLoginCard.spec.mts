/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureLogin/AzureLoginCard.tsx
import { expect, test } from "@playwright/test";
import {
  installMockAzure,
  installMockGitHub,
  mockMsaTenantId,
  mockSubscriptionId,
  mockSecondSubscriptionId,
  mockSecondTenantId,
  mockTenantId,
  prepareMockAzureSubscription,
  signInMockAzure,
} from "../util/mockTestHelper.mts";
import { CORP_URL, viewports } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import { createNewRepo } from "../util/testHelper.mts";
import { expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard } from "../util/cardHelper.mts";

const mockTenants = [
  { tenantId: mockTenantId, displayName: "Mock tenant" },
  { tenantId: mockSecondTenantId, displayName: "Mock second tenant" },
];

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`Azure Login Card Mock - ${viewportName}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test.beforeEach(async ({ page }) => {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    });

    test.afterEach(async ({ page }, testInfo) => {
      await attachJSCoverage(page, testInfo);
    });

    test("Happy path", async ({ page }, testInfo) => {
      const card = await test.step("Expand unauthenticated Azure login card", async () => {
        await page.goto(CORP_URL);
        const result = await expandAzureLoginCard(page);
        await expectSnapshot(page, result, testInfo, "start", viewportName);
        return result;
      });

      await test.step("Signs in and selects the mocked tenant", async () => {
        await installMockAzure(page, { tenants: mockTenants });
        await signInMockAzure(page, [], [mockTenantId, mockSecondTenantId]);
        await expect(card.getByText(/Signed in as/i)).toBeVisible();
        await expect(card.getByTestId("txtAzureUsername")).toHaveText("mock-user@example.com");
        await expect(card.getByText("Loading tenants...", { exact: true })).toBeHidden();
        const tenantSelect = card.getByTestId("tenant-select");
        await expect(tenantSelect).toBeVisible();
        await tenantSelect.click();
        await page.getByRole("option", { name: /Mock tenant/ }).click();
        await expect(tenantSelect.locator("input")).toHaveValue(mockTenantId);
        await expect(card.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
        await expectSnapshot(page, card, testInfo, "end", viewportName);
      });
    });

    test("Tenant changes invalidate the previous subscription", async ({ page, context }, testInfo) => {
      const repoName = `mock-azure-tenant-switch-${viewportName.toLowerCase()}`;
      await installMockGitHub(page, context);
      await installMockAzure(page, {
        tenants: mockTenants,
        subscriptions: [
          { subscriptionId: mockSubscriptionId, displayName: "Mock subscription", tenantId: mockTenantId, state: "Enabled" },
          { subscriptionId: mockSecondSubscriptionId, displayName: "Mock second subscription", tenantId: mockSecondTenantId, state: "Enabled" },
          { subscriptionId: "mock-subscription-alternate", displayName: "Mock alternate subscription", tenantId: mockTenantId, state: "Enabled" },
        ],
      });
      await page.goto(CORP_URL);
      const loginCard = await expandAzureLoginCard(page);
      await signInMockAzure(page, [], [mockTenantId, mockSecondTenantId]);
      const tenantSelect = loginCard.getByTestId("tenant-select");
      await expect(loginCard.getByText("Loading tenants...", { exact: true })).toBeHidden();
      await tenantSelect.click();
      await page.getByRole("option", { name: /Mock tenant/ }).click();
      await expect(tenantSelect.locator("input")).toHaveValue(mockTenantId);

      const repoCard = await expandRepoCard(page);
      await createNewRepo(page, repoCard, repoName);
      await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
      await repoCard.getByText("PROD", { exact: true }).click();
      const createBranch = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
      if (await createBranch.isVisible()) {
        await createBranch.click();
        await expect(createBranch).toBeHidden();
      }

      const subscriptionCard = await expandAzureSubscriptionCard(page);
      const subscriptionSelect = subscriptionCard.getByRole("combobox");
      await expect(subscriptionSelect).toContainText("Select a subscription");
      await subscriptionSelect.click();
      await page.getByRole("option", { name: /Mock subscription/ }).click();
      await expect(subscriptionSelect).toContainText("Mock subscription");
      await subscriptionSelect.click();
      await page.getByRole("option", { name: /Mock alternate subscription/ }).click();
      await expect(subscriptionSelect).toContainText("Mock alternate subscription");
      await expectSnapshot(page, subscriptionCard, testInfo, "first-tenant-subscription", viewportName);

      await tenantSelect.click();
      await page.getByRole("option", { name: /Mock second tenant/ }).click();
      await expect(tenantSelect.locator("input")).toHaveValue(mockSecondTenantId);
      await expect(subscriptionSelect).toContainText("Mock second subscription");
      await expectSnapshot(page, subscriptionCard, testInfo, "second-tenant-subscription", viewportName);
    });

    test("An empty tenant list permits manual tenant confirmation", async ({ page }, testInfo) => {
      await installMockAzure(page, { tenants: [] });
      await page.goto(CORP_URL);
      const card = await expandAzureLoginCard(page);
      await signInMockAzure(page, [], [], {
        accountTenantId: mockMsaTenantId,
        armTokenTenantIds: [],
      });
      await expect(card.getByText(/Signed in as/i)).toBeVisible();
      await expect(card.getByText("Loading tenants...", { exact: true })).toBeHidden();
      const tenantIdInput = card.getByPlaceholder("Tenant ID");
      await expect(tenantIdInput).toBeVisible();
      const confirmButton = card.getByRole("button", { name: "Confirm tenant" });
      await expect(confirmButton).toBeDisabled();
      await tenantIdInput.fill(mockTenantId);
      await expect(confirmButton).toBeEnabled();
      await expectSnapshot(page, card, testInfo, "manual-tenant-ready", viewportName);
      const authorizationRequest = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.hostname === "login.microsoftonline.com" && url.pathname.startsWith(`/${mockTenantId}/oauth2/v2.0/authorize`);
      });
      await confirmButton.click();
      expect(new URL((await authorizationRequest).url()).pathname).toContain(`/${mockTenantId}/oauth2/v2.0/authorize`);
    });

    test("A saved tenant missing from the available tenant list is called out", async ({ page, context }, testInfo) => {
      const missingTenantId = "00000000-0000-0000-0000-000000000099";
      await prepareMockAzureSubscription(page, context, `mock-saved-tenant-missing-${viewportName.toLowerCase()}`, {
        initialVariables: {
          AZURE_TENANT_ID: missingTenantId,
          AZURE_SUBSCRIPTION_ID: "",
          VITE_AZURE_TENANT_ID: missingTenantId,
        },
        tenantIds: [mockTenantId, missingTenantId],
      });
      await page.evaluate((tenantId) => sessionStorage.setItem("zeninstaller_arm_tenant", tenantId), missingTenantId);
      await page.reload();
      const card = await expandAzureLoginCard(page);
      await expect(card.getByText("Saved tenant not found — please pick another.", { exact: true })).toBeVisible();
      await expect(card.getByTestId("tenant-select").locator("input")).toHaveValue(missingTenantId);
      await expectSnapshot(page, card, testInfo, "saved-tenant-missing", viewportName);
    });

    test("Azure sign-in requests the Microsoft authentication handoff", async ({ page }, testInfo) => {
      await installMockAzure(page);
      await page.route("https://login.microsoftonline.com/**", (route) => route.abort("blockedbyclient"));
      await page.goto(CORP_URL);
      const card = await expandAzureLoginCard(page);
      const authorizationRequest = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.hostname === "login.microsoftonline.com" && url.pathname.includes("/oauth2/v2.0/authorize");
      });
      await card.getByRole("button", { name: "Sign in with Azure", exact: true }).click();
      const authorizeUrl = new URL((await authorizationRequest).url());
      expect(authorizeUrl.searchParams.get("client_id")).toBeTruthy();
      expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
      expect(authorizeUrl.searchParams.get("prompt")).toBe("select_account");
      await page.goto(CORP_URL);
      const unauthenticatedCard = await expandAzureLoginCard(page);
      await expect(unauthenticatedCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
      await expect(unauthenticatedCard.getByText(/Signed in as/i)).toHaveCount(0);
      await expectSnapshot(page, unauthenticatedCard, testInfo, "authentication-handoff", viewportName);
    });

    test("Signing Out button logs out current user", async ({ page }, testInfo) => {
      await page.goto(CORP_URL);
      await installMockAzure(page);
      const card = await expandAzureLoginCard(page);
      await signInMockAzure(page);
      await expect(card.getByText(/Signed in as/i)).toBeVisible();
      await card.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(card.getByText(/Signed in as/i)).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
      await expectSnapshot(page, card, testInfo, "signed-out", viewportName);
      await page.reload();
      await expect(card.getByText(/Signed in as/i)).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
    });
  });
}
