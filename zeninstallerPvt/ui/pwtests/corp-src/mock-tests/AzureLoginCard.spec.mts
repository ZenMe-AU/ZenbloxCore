/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureLogin/AzureLoginCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../../../../../.playwright/viewportFixture.mjs";
import {
  installMockAzure,
  mockMsaTenantId,
  mockSecondTenantId,
  mockTenantId,
  prepareMockAzureSubscription,
  signInMockAzure,
} from "../util/mockTestHelper.mts";
import { CORP_URL } from "../../testInit";
import { expectSnapshot } from "../../../../../.playwright/testHelper.js";
import { expandAzureLoginCard } from "../util/cardHelper.mts";

const mockTenants = [
  { tenantId: mockTenantId, displayName: "Mock tenant" },
  { tenantId: mockSecondTenantId, displayName: "Mock second tenant" },
];

test("Happy path", async ({ page }, testInfo) => {
  await runHappyPath({ page }, testInfo);
});

test("An empty tenant list permits manual tenant confirmation", async ({ page }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  await installMockAzure(page, { tenants: [] });
  await page.goto(CORP_URL);
  const card = await expandAzureLoginCard(page);
  await signInMockAzure(page, [], [], {
    accountTenantId: mockMsaTenantId,
    armTokenTenantIds: [],
  });
  await expect(card.getByText(/Signed in as/i)).toBeVisible();
  await expect(card.getByText("Loading tenants...", { exact: true })).toBeHidden();
  const tenantIdInput = card.getByRole("textbox", { name: "Tenant", exact: true });
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

test("Saved tenant missing from tenant list", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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

test("Signs out current user", async ({ page }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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

async function runHappyPath({ page }: { page: import("@playwright/test").Page }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  const viewportName = getViewportName(testInfo);
  const card = await test.step("Expand unauthenticated Azure login card", async () => {
    await page.goto(CORP_URL);
    const result = await expandAzureLoginCard(page);
    const accountGuide = result.getByRole("link", { name: /How to create a free Azure account/ });
    await expect(accountGuide).toHaveCSS("font-size", "16px");
    await expect(accountGuide).toHaveCSS("text-decoration-line", "none");
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
    await expect(card.getByRole("combobox", { name: /^Tenant\b/ })).toBeVisible();
    const tenantHelp = card.getByRole("link", { name: "Show page to get Tenant ID (opens in new tab)", exact: true });
    await expect(tenantHelp).toHaveAttribute("href", "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview");
    await expect(tenantHelp).toHaveAttribute("target", "_blank");
    await tenantSelect.click();
    await page.getByRole("option", { name: /Mock tenant/ }).click();
    await expect(tenantSelect.locator("input")).toHaveValue(mockTenantId);
    await expect(card.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Next step, set up 'Repository & environment'" })).toHaveCount(0);
    await expectSnapshot(page, card, testInfo, "end", viewportName);
  });
}
