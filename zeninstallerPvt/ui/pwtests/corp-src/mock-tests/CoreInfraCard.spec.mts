/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type BrowserContext, type Page } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { AZURE_MANAGEMENT_URL, CORP_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import { expandAzureAppRegistrationCard, expandAzureSubscriptionCard } from "../util/cardHelper.mts";
import {
  coreInfraStepLabels,
  expectSuccessfulSteps,
  installCoreInfraAzureMock,
  installMockGitHub,
  mockSubscriptionId,
  mockSecondSubscriptionId,
  mockServicePrincipalId,
  mockTenantId,
  prepareMockAzureSubscription,
} from "../util/mockTestHelper.mts";

type CoreInfraMockOptions = {
  includeSecondSubscription?: boolean;
  failRegionLookup?: boolean;
  failFirstResourceGroupPut?: boolean;
};


test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Allows manual region entry when Azure region lookup fails", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  test.setTimeout(240_000);
  const { card, resourceWrites, unexpectedRequests } = await prepareCoreInfraCard(page, context, viewportName, {
    failRegionLookup: true,
  });
  await saveCoreCompanyCode(card);
  await expect(card.getByText("Couldn't load Azure region list — type the region name manually.", { exact: true })).toBeVisible();
  const locationRow = card.getByText(/Location:/).locator("..");
  await locationRow.getByRole("button").click();
  const regionInput = locationRow.getByRole("textbox");
  await regionInput.fill("westus2");
  await locationRow.getByRole("button").click();
  await expect(locationRow).toContainText("westus2");
  await card.getByRole("button", { name: "Create core infrastructure" }).click();
  await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 180_000 });
  await expectSuccessfulSteps(card, coreInfraStepLabels("pwtests"));
  const resourceGroupWrite = resourceWrites.find((write) => write.path.endsWith("/resourcegroups/root-pwtests"));
  expect(resourceGroupWrite?.body).toMatchObject({ location: "westus2" });
  await expectSnapshot(page, card, testInfo, "manual-region-fallback", viewportName);
});

test("Retries a transient resource-group provisioning failure", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  test.setTimeout(240_000);
  const { card, azureMock, getResourceGroupPutAttempts, unexpectedRequests } = await prepareCoreInfraCard(
    page,
    context,
    viewportName,
    { failFirstResourceGroupPut: true },
  );
  await saveCoreCompanyCode(card);
  await card.getByRole("button", { name: "Create core infrastructure" }).click();
  await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 180_000 });
  const resourceGroupRow = card.getByText("Create resource group root-pwtests", { exact: true }).locator("../..");
  await expect(resourceGroupRow.locator('svg[data-testid="ErrorOutlineIcon"]')).toHaveCount(1);
  await expect(azureMock.createdResources).not.toContain("resource-group");
  await card.getByRole("button", { name: "Start over" }).click();
  await expect(card.getByRole("button", { name: "Create core infrastructure" })).toBeEnabled();
  await runCoreInfrastructure(card);
  expect(getResourceGroupPutAttempts()).toBe(2);
  await expect(azureMock.createdResources).toContain("resource-group");
  await expectSnapshot(page, card, testInfo, "resource-group-retry", viewportName);
});

test("Does not reuse infrastructure status after the subscription target drifts", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  test.setTimeout(240_000);
  const { card, prepared, azureMock, unexpectedRequests } = await prepareCoreInfraCard(page, context, viewportName, {
    includeSecondSubscription: true,
  });
  await saveCoreCompanyCode(card);
  await runCoreInfrastructure(card);
  expect(azureMock.createdResources).toContain("resource-group");

  const secondSubscriptionId = `/subscriptions/${mockSecondSubscriptionId}`;
  await page.route(`${AZURE_MANAGEMENT_URL}${secondSubscriptionId}/providers/Microsoft.Authorization/roleAssignments**`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        value: [{
          properties: {
            roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/acdd72a7-3385-48ef-bd42-f606fba81ae7",
            principalId: mockServicePrincipalId,
            principalType: "ServicePrincipal",
          },
        }],
      }),
    });
  });
  await page.route(`${AZURE_MANAGEMENT_URL}${secondSubscriptionId}/resourcegroups/root-pwtests`, async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ResourceNotFound" } }),
      });
    }
    return route.fallback();
  });
  const subscriptionCard = await expandAzureSubscriptionCard(page);
  await subscriptionCard.getByRole("combobox").click();
  await page.getByRole("option", { name: /^Mock second subscription\b/ }).click();
  const saveTargetButton = subscriptionCard.getByRole("button", { name: /^Save \d+ variables?$/ });
  await expect(saveTargetButton).toBeEnabled();
  await saveTargetButton.click();
  await expect.poll(() => prepared.github.variables.AZURE_SUBSCRIPTION_ID).toBe(mockSecondSubscriptionId);
  await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.toLowerCase();
    if (request.method() === "GET" && path.endsWith(`/resourcegroups/root-pwtests`)) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ResourceNotFound" } }),
      });
    }
    return route.fallback();
  });
  await page.reload();
  await prepareMockAppRegistration(page, viewportName);
  const driftedCard = page.locator("#card-core_infra");
  await openCoreInfraCard(driftedCard);
  await expect(prepared.github.variables.AZURE_SUBSCRIPTION_ID).toBe(mockSecondSubscriptionId);
  await expect(driftedCard.getByRole("button", { name: "Create core infrastructure" })).toBeEnabled();
  await expect(driftedCard.getByRole("button", { name: "Re-run setup" })).toHaveCount(0);
  await expectSnapshot(page, driftedCard, testInfo, "target-drift", viewportName);
});

test("Recreates missing infrastructure and repairs revoked resource-group access", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  test.setTimeout(240_000);
  const { card, azureMock, unexpectedRequests } = await prepareCoreInfraCard(page, context, viewportName);
  await saveCoreCompanyCode(card);
  await runCoreInfrastructure(card);
  const groupScope = `/subscriptions/${mockSubscriptionId}/resourcegroups/root-pwtests`;
  azureMock.createdResources.delete("resource-group");
  azureMock.createdResources.delete("storage-container");
  azureMock.roleAssignments.get(groupScope)?.delete("acdd72a7-3385-48ef-bd42-f606fba81ae7");

  await page.reload();
  await prepareMockAppRegistration(page, viewportName);
  const recoveredCard = page.locator("#card-core_infra");
  await openCoreInfraCard(recoveredCard);
  await expect(recoveredCard.getByText("The resource group doesn't exist in the selected subscription anymore — re-run to recreate it.", { exact: true })).toBeVisible();
  await recoveredCard.getByRole("button", { name: "Create core infrastructure" }).click();
  await expect(recoveredCard.getByText("Running...", { exact: true })).toBeHidden({ timeout: 180_000 });
  await expectSuccessfulSteps(recoveredCard, coreInfraStepLabels("pwtests"));
  expect(azureMock.createdResources).toContain("resource-group");
  expect(azureMock.createdResources).toContain("storage-container");
  expect(azureMock.roleAssignments.get(groupScope)).toContain("acdd72a7-3385-48ef-bd42-f606fba81ae7");
  await expectSnapshot(page, recoveredCard, testInfo, "resource-recovery", viewportName);
});

test("Shows prerequisites before infrastructure setup", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  await installMockGitHub(page, context);
  await page.goto(CORP_URL);
  const card = page.locator("#card-core_infra");
  await card.getByText("Terraform state backend", { exact: true }).click();

  await expect(card.getByText("Complete these first", { exact: true })).toBeVisible();
  for (const prerequisite of ["Sign in to Azure", "Select a repository & environment", "Select a subscription", "Complete the Azure app registration"]) {
    await expect(card.getByText(prerequisite, { exact: true })).toBeVisible();
  }
  await expect(card.getByRole("button", { name: "Create core infrastructure" })).toHaveCount(0);
  await expectSnapshot(page, card, testInfo, "prerequisites-required", viewportName);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  const viewportName = getViewportName(testInfo);
  const companyShortCode = "pwtests";
  test.setTimeout(240_000);
  const { card, prepared, azureMock, resourceWrites, unexpectedRequests } = await prepareCoreInfraCard(
    page,
    context,
    viewportName,
  );
  await expectSnapshot(page, card, testInfo, "start", viewportName);

  await test.step("Open backend card where core infrastructure does not exist", async () => {
    await saveCoreCompanyCode(card);
    await expect(card.getByRole("button", { name: "Create core infrastructure" })).toBeEnabled();
    await chooseAustraliaEast(card, page);
    await expectSnapshot(page, card, testInfo, "not-setup-start", viewportName);
  });

  await test.step("Provision the Terraform state backend", async () => {
    await runCoreInfrastructure(card);
    await expect(card.getByRole("button", { name: "Start over" })).toBeVisible();
    await expect([...azureMock.createdResources]).toEqual(
      expect.arrayContaining(["resource-group", "log-analytics", "diagnostics", "app-insights", "storage-account", "storage-container"])
    );
    const resourceGroupWrite = resourceWrites.find((write) => write.path.endsWith("/resourcegroups/root-pwtests"));
    expect(resourceGroupWrite?.body).toMatchObject({ location: "australiaeast" });
    await expectSnapshot(page, card, testInfo, "provisioned", viewportName);
  });

  await test.step("Verify the completed card state", async () => {
    await card.getByRole("button", { name: "Start over" }).click();
    await page.reload();
    await prepareMockAppRegistration(page, viewportName);
    const reloadedCard = page.locator("#card-core_infra");
    await openCoreInfraCard(reloadedCard);
    await expect(reloadedCard.getByText("Resources", { exact: true })).toBeVisible();
    await expect(reloadedCard.getByText("Resource group: root-pwtests", { exact: true })).toBeVisible();
    await expect(reloadedCard.getByText("State container: terraformstate", { exact: true })).toBeVisible();
    await expectSnapshot(page, reloadedCard, testInfo, "end", viewportName);
  });

  await test.step("Re-run existing core infrastructure setup", async () => {
    const reloadedCard = page.locator("#card-core_infra");
    const resourcesBeforeRerun = [...azureMock.createdResources].sort();
    const roleAssignmentsBeforeRerun = [...azureMock.roleAssignments.entries()]
      .map(([scope, roles]) => [scope, [...roles].sort()] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    const writesBeforeRerun = resourceWrites.length;
    await reloadedCard.getByRole("button", { name: "Re-run setup" }).click();
    await expect(reloadedCard.getByText("Running...", { exact: true })).toBeHidden({ timeout: 180_000 });
    await expectSuccessfulSteps(reloadedCard, coreInfraStepLabels("pwtests"));
    await expect(reloadedCard.getByText("Already exists", { exact: true }).first()).toBeVisible();
    expect(resourceWrites).toHaveLength(writesBeforeRerun);
    expect([...azureMock.createdResources].sort()).toEqual(resourcesBeforeRerun);
    expect(
      [...azureMock.roleAssignments.entries()]
        .map(([scope, roles]) => [scope, [...roles].sort()] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ).toEqual(roleAssignmentsBeforeRerun);
    await expect(reloadedCard.getByRole("button", { name: "Start over" })).toBeVisible();
    await expectSnapshot(page, reloadedCard, testInfo, "rerun-complete", viewportName);
  });

  const readerRoleId = "acdd72a7-3385-48ef-bd42-f606fba81ae7";
  const storageReaderRoleId = "2a2b9908-6ea1-4ae2-8e65-a410df84e7d1";
  expect(azureMock.roleAssignments.get(`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${companyShortCode}`)).toContain(readerRoleId);
  expect(
    azureMock.roleAssignments.get(
      `/subscriptions/${mockSubscriptionId}/resourcegroups/root-${companyShortCode}/providers/microsoft.storage/storageaccounts/${companyShortCode}pvt`
    )
  ).toContain(storageReaderRoleId);
  expect(prepared.github.variables.NAME).toBe("pwtests");
}

async function prepareMockAppRegistration(page: Page, viewportName: string) {
  const appRegistrationCard = await expandAzureAppRegistrationCard(page);
  const createButton = appRegistrationCard.getByRole("button", { name: "Create app registration", exact: true });
  await expect(createButton).toBeVisible();
  await appRegistrationCard.locator("input:visible").first().fill(`mock-core-infra-${viewportName.toLowerCase()}`);
  await createButton.click();
  await expect(appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden({ timeout: 180_000 });
  await expect(appRegistrationCard.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i)).toBeVisible();
}

async function prepareCoreInfraCard(
  page: Page,
  context: BrowserContext,
  viewportName: string,
  options: CoreInfraMockOptions = {},
) {
  const unexpectedRequests: string[] = [];
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === new URL(CORP_URL).origin) {
      return route.continue();
    }
    unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort("blockedbyclient");
  });
  await context.route("https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await context.route("https://australiaeast-1.in.applicationinsights.azure.com/v2/track", (route) =>
    route.fulfill({ status: 200, json: { itemsReceived: 0, itemsAccepted: 0, errors: [] } }),
  );

  const companyShortCode = "pwtests";
  const prepared = await prepareMockAzureSubscription(
    page,
    context,
    `mock-core-infra-${viewportName.toLowerCase()}`,
    {
      initialAzureState: {
        appDisplayName: `mock-core-infra-${viewportName.toLowerCase()}`,
        servicePrincipalCreated: true,
        rbacAssigned: true,
        ...(options.includeSecondSubscription
          ? {
              subscriptions: [
                { subscriptionId: mockSubscriptionId, displayName: "Mock subscription", tenantId: mockTenantId, state: "Enabled" },
                { subscriptionId: mockSecondSubscriptionId, displayName: "Mock second subscription", tenantId: mockTenantId, state: "Enabled" },
              ],
            }
          : {}),
      },
    },
  );
  if (options.includeSecondSubscription) {
    await prepared.azureSubscriptionCard.getByRole("combobox").click();
    await page.getByRole("option", { name: /^Mock subscription\b/ }).click();
  }
  const saveSubscriptionButton = prepared.azureSubscriptionCard.getByRole("button", {
    name: "Save 3 variables",
    exact: true,
  });
  await expect(saveSubscriptionButton).toBeEnabled();
  await saveSubscriptionButton.click();
  await expect(prepared.azureSubscriptionCard.getByRole("button", { name: /^Save variables$/ })).toBeDisabled();
  expect(prepared.github.variables).toMatchObject({
    AZURE_TENANT_ID: expect.any(String),
    AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
    VITE_AZURE_TENANT_ID: expect.any(String),
  });

  const azureMock = await installCoreInfraAzureMock(page);
  const resourceWrites: Array<{ path: string; body: unknown }> = [];
  let resourceGroupPutAttempts = 0;
  const rootGroupSuffix = `/resourcegroups/root-${companyShortCode}`.toLowerCase();
  await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.toLowerCase();
    const method = request.method();

    if (options.failRegionLookup && method === "GET" && path.endsWith("/locations")) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ServiceUnavailable", message: "Temporary region-list failure" } }),
      });
    }
    if (method === "PUT" && path.endsWith(rootGroupSuffix)) {
      resourceGroupPutAttempts += 1;
      if (options.failFirstResourceGroupPut && resourceGroupPutAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "ServiceUnavailable", message: "Temporary resource-group failure" } }),
        });
      }
    }
    if (method === "PUT") {
      resourceWrites.push({ path, body: request.postDataJSON() });
    }
    return route.fallback();
  });

  await page.reload();
  await prepareMockAppRegistration(page, viewportName);
  expect(prepared.github.variables.AZURE_CLIENT_ID).toBeTruthy();
  expect(prepared.github.variables.AZURE_PLAN_CLIENT_ID).toBe(prepared.github.variables.AZURE_CLIENT_ID);
  const card = page.locator("#card-core_infra");
  await card.getByText("Terraform state backend", { exact: true }).click();
  await expect(card.getByText("Company short code", { exact: true })).toBeVisible();
  return { card, prepared, azureMock, resourceWrites, unexpectedRequests, getResourceGroupPutAttempts: () => resourceGroupPutAttempts };
}

async function openCoreInfraCard(card: import("@playwright/test").Locator) {
  const companyHeading = card.getByText("Company short code", { exact: true });
  if (!(await companyHeading.isVisible().catch(() => false))) {
    await card.getByText("Terraform state backend", { exact: true }).click();
  }
  await expect(companyHeading).toBeVisible();
}

async function saveCoreCompanyCode(card: import("@playwright/test").Locator) {
  const companyInput = card.getByText("COMPANY_SHORT_CODE", { exact: true }).locator("../..").getByRole("textbox");
  if (!(await companyInput.inputValue()).trim()) {
    await companyInput.fill("pwtests");
  }
  const saveButton = card.getByRole("button", { name: /^Save 1 variable$/ });
  if (await saveButton.isVisible()) await saveButton.click();
  await expect(card.getByRole("button", { name: /^Save variables$/ })).toBeDisabled();
  await expect(companyInput).toHaveValue("pwtests");
}

async function chooseAustraliaEast(card: import("@playwright/test").Locator, page: Page) {
  const locationRow = card.getByText(/Location:/).locator("..");
  await locationRow.getByRole("button").click();
  await locationRow.getByRole("combobox").click();
  await page.getByRole("option", { name: /Australia East.*australiaeast/i }).click();
  await locationRow.getByRole("button").click();
  await expect(locationRow).toContainText("Australia East");
}

async function runCoreInfrastructure(card: import("@playwright/test").Locator) {
  const setupButton = card.getByRole("button", { name: /^(?:Create core infrastructure|Re-run setup)$/ });
  await expect(setupButton).toBeEnabled();
  await setupButton.click();
  await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 180_000 });
  await expectSuccessfulSteps(card, coreInfraStepLabels("pwtests"));
}
