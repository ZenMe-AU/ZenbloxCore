/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureAppRegistration/AzureAppRegistrationCard.tsx
import { test, expect } from "@playwright/test";
import { CORP_URL, GITHUB_API_URL, MICROSOFT_GRAPH_URL } from "../../testInit";
import { createNewRepo } from "../util/testHelper.mts";
import { attachJSCoverage, expectSnapshot, safePathSegment } from "../../util/testHelper.ts";
import {
  expectSuccessfulSteps,
  installMockAzure,
  installMockGitHub,
  mockReaderRoleId,
  mockServicePrincipalId,
  mockSubscriptionId,
  mockTenantId,
  prepareMockAzureSubscription,
  signInMockAzure,
  type MockAzureState,
} from "../util/mockTestHelper.mts";
import { expandAzureAppRegistrationCard, expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard } from "../util/cardHelper.mts";

async function prepareMockAppRegistrationCard(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  repoName: string,
  options: { initialVariables?: Record<string, string>; initialAzureState?: Partial<MockAzureState> } = {}
) {
  const prepared = await prepareMockAzureSubscription(page, context, repoName, { saveVariables: true, ...options });
  return {
    ...prepared,
    appRegistrationCard: await expandAzureAppRegistrationCard(page),
  };
}

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Edge case - keeps creation disabled for a blank app name", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-blank-${viewportName.toLowerCase()}`);
  const appNameInput = prepared.appRegistrationCard.locator("input:visible").first();
  const createButton = prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" });
  await appNameInput.fill("   ");
  await expect(createButton).toBeDisabled();
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "blank-app-name-empty-state", viewportName);
});

test("Edge case - warns when the two saved client IDs differ", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-client-id-mismatch-${viewportName.toLowerCase()}`, {
    initialVariables: {
      AZURE_TENANT_ID: mockTenantId,
      AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
      VITE_AZURE_TENANT_ID: mockTenantId,
      AZURE_CLIENT_ID: "mock-app-id",
      AZURE_PLAN_CLIENT_ID: "different-client-id",
    },
  });
  await expect(prepared.appRegistrationCard.getByText("AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID — re-run to bring it back in sync.", { exact: true })).toBeVisible();
  await expect(prepared.appRegistrationCard.getByRole("button", { name: "Create app registration", exact: true })).toBeEnabled();
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "client-id-mismatch", viewportName);
});

test("Edge case - reports and recovers from a provisioning failure", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-provision-retry-${viewportName.toLowerCase()}`, {
    initialAzureState: { applicationCreationFailuresRemaining: 1 },
  });
  const appNameInput = prepared.appRegistrationCard.locator("input:visible").first();
  await appNameInput.fill("mock-app-provision-retry");
  await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
  await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
  await expect(prepared.appRegistrationCard.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(prepared.appRegistrationCard.getByText("Mock app creation failed", { exact: false })).toBeVisible();
  expect(prepared.azure.appDisplayName).toBeNull();
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "provisioning-failed", viewportName);

  await prepared.appRegistrationCard.getByRole("button", { name: "Try again" }).click();
  await expect(appNameInput).toBeVisible();
  await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
  await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
  await expect(prepared.appRegistrationCard.getByRole("button", { name: "Try again" })).toBeVisible();
  await expectSuccessfulSteps(prepared.appRegistrationCard, [
    "Confirm Microsoft permissions",
    "Create app registration",
    "Create service principal",
    "Switch GitHub OIDC to immutable subject",
    "Add federated credentials",
    "Assign RBAC roles",
  ]);
  expect(prepared.azure.appDisplayName).toBe("mock-app-provision-retry");
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "provisioning-recovered", viewportName);
});

test("Surfaces a Microsoft Graph permission rejection", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-consent-rejected-${viewportName.toLowerCase()}`, {
    initialAzureState: { applicationLookupFailureStatus: 403 },
  });
  const appNameInput = prepared.appRegistrationCard.locator("input:visible").first();
  await appNameInput.fill("mock-app-consent-rejected");
  await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
  await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
  await expect(prepared.appRegistrationCard.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(prepared.appRegistrationCard.getByText(/403.*Mock Graph permission denied/i)).toBeVisible();
  expect(prepared.azure.appDisplayName).toBeNull();
  expect(prepared.azure.federatedCredentialWrites).toHaveLength(0);
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "graph-permission-rejected", viewportName);
});

test("Reuses existing app", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-retry-${viewportName.toLowerCase()}`);
  const appNameInput = prepared.appRegistrationCard.locator("input:visible").first();
  await appNameInput.fill("zeninstaller-existing-mock-app");
  await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
  await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
  await expect(prepared.appRegistrationCard.getByRole("button", { name: "Try again" })).toBeVisible();

  await prepared.appRegistrationCard.getByRole("button", { name: "Try again" }).click();
  await expect(appNameInput).toBeVisible();
  await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
  await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
  await expect(prepared.appRegistrationCard.getByText(/Existing:/i)).toBeVisible();
  await expect(prepared.appRegistrationCard.getByText("Already exists", { exact: true })).toBeVisible();
  await expect(prepared.appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i)).toBeVisible();
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "existing-app-reused", viewportName);
});

test("Warns when the saved app is missing", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  await context.addInitScript(() => {
    localStorage.setItem(
      "zeninstaller_azure_result",
      JSON.stringify({ clientId: "mock-app-id", tenantId: "00000000-0000-0000-0000-000000000001", subscriptionIds: ["mock-subscription"] })
    );
  });
  await prepareMockAzureSubscription(page, context, `mock-app-missing-sp-${viewportName.toLowerCase()}`, {
    initialVariables: {
      AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_SUBSCRIPTION_ID: "mock-subscription",
      VITE_AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_CLIENT_ID: "mock-app-id",
      AZURE_PLAN_CLIENT_ID: "mock-app-id",
    },
  });
  const card = await expandAzureAppRegistrationCard(page);

  await expect(card.getByText("This app registration doesn't exist in the selected tenant — create a new one.", { exact: true })).toBeVisible();
  await expect(card.locator('svg[data-testid="ErrorOutlineIcon"]')).toHaveCount(2);
  await expectSnapshot(page, card, testInfo, "saved-app-missing", viewportName);
});

test("Warns when there is no subscription role", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  await context.addInitScript(() => {
    localStorage.setItem(
      "zeninstaller_azure_result",
      JSON.stringify({ clientId: "mock-app-id", tenantId: "00000000-0000-0000-0000-000000000001", subscriptionIds: ["mock-subscription"] })
    );
  });
  const prepared = await prepareMockAzureSubscription(page, context, `mock-app-missing-role-${viewportName.toLowerCase()}`, {
    initialVariables: {
      AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_SUBSCRIPTION_ID: "mock-subscription",
      VITE_AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_CLIENT_ID: "mock-app-id",
      AZURE_PLAN_CLIENT_ID: "mock-app-id",
    },
  });
  prepared.azure.servicePrincipalCreated = true;
  await page.reload();
  const card = await expandAzureAppRegistrationCard(page);

  await expect(card.getByText(/Missing on the selected subscription:/)).toContainText("Reader");
  await expect(card.getByRole("button", { name: "Grant access on this subscription" })).toBeVisible();
  await expectSnapshot(page, card, testInfo, "saved-app-role-missing", viewportName);

  await card.getByRole("button", { name: "Grant access on this subscription" }).click();
  await expect(card.getByText(/Missing on the selected subscription:/)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Grant access on this subscription" })).toHaveCount(0);
  expect(prepared.azure.rbacAssigned).toBe(true);
  expect(prepared.azure.roleAssignmentWrites).toEqual([
    {
      url: expect.stringContaining(`/subscriptions/${mockSubscriptionId}/providers/Microsoft.Authorization/roleAssignments/`),
      scope: `/subscriptions/${mockSubscriptionId}`,
      roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${mockReaderRoleId}`,
      principalId: mockServicePrincipalId,
      principalType: "ServicePrincipal",
    },
  ]);
  await expectSuccessfulSteps(card, [
    "Confirm Microsoft permissions",
    "Create app registration",
    "Create service principal",
    "Switch GitHub OIDC to immutable subject",
    "Add federated credentials",
    "Assign RBAC roles",
  ]);
  await expectSnapshot(page, card, testInfo, "subscription-role-granted", viewportName);
});

test("Reports when connection details fail to auto-save", async ({ page, context }, testInfo) => {
  const viewportName = testInfo.project.name;
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-autosave-error-${viewportName.toLowerCase()}`);
  let failedWrites = 0;
  await page.route(`${GITHUB_API_URL}/repos/**/environments/PROD/variables`, async (route) => {
    if (route.request().method() !== "POST" || failedWrites > 0) {
      await route.fallback();
      return;
    }
    failedWrites += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "mock failure" }) });
  });
  const appNameInput = prepared.appRegistrationCard.locator("input:visible").first();
  await appNameInput.fill(`mock-autosave-${viewportName.toLowerCase()}`);
  await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
  await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
  await expect(prepared.appRegistrationCard.getByText("Some connection details failed to save — check below.", { exact: true })).toBeVisible();
  expect(failedWrites).toBe(1);
  const savedClientKeys = ["AZURE_CLIENT_ID", "AZURE_PLAN_CLIENT_ID"].filter((key) => prepared.github.variables[key]);
  expect(savedClientKeys).toHaveLength(1);
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "connection-details-save-failed", viewportName);

  const retrySave = prepared.appRegistrationCard.getByRole("button", { name: /^Save 1 variable$/ });
  await expect(retrySave).toBeEnabled();
  await retrySave.click();
  await expect(prepared.appRegistrationCard.getByRole("button", { name: "Save variables" })).toBeDisabled();
  await expect.poll(() => [
    prepared.github.variables.AZURE_CLIENT_ID,
    prepared.github.variables.AZURE_PLAN_CLIENT_ID,
  ]).toEqual(["00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000002"]);
  await page.reload();
  const persistedCard = await expandAzureAppRegistrationCard(page);
  const persistedInputs = persistedCard.locator('[data-sensitive="true"] input');
  await expect(persistedInputs).toHaveCount(2);
  const persistedIds = await persistedInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.trim()));
  expect(persistedIds).toEqual([
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000002",
  ]);
  await expectSnapshot(page, persistedCard, testInfo, "connection-details-recovered-after-reload", viewportName);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  const viewportName = testInfo.project.name;
  const runId = Date.now().toString(36);
  const repoName = safePathSegment(`mock-azure-app-${viewportName.toLowerCase()}`);
  const appName = `zeninstaller-${repoName}`;
  const github = await installMockGitHub(page, context);
  const azure = await installMockAzure(page);
  await page.goto(CORP_URL);

  const azureLoginCard = await test.step("Select the restored Azure tenant", async () => {
    const card = await expandAzureLoginCard(page);
    await expectSnapshot(page, card, testInfo, "start", viewportName);
    await signInMockAzure(page);
    await expect(card.getByText(/Signed in as/i)).toBeVisible();
    const tenantSelect = card.getByTestId("tenant-select");
    await expect(tenantSelect).toBeVisible();
    await tenantSelect.click();
    await page.getByRole("option", { name: /Mock tenant/i }).click();
    await expectSnapshot(page, card, testInfo, "tenant-selected", viewportName);
    return card;
  });

  const repoCard = await test.step("Create a repository and PROD environment", async () => {
    const card = await expandRepoCard(page);
    await createNewRepo(page, card, repoName);
    await expect(card.getByText("Loading environments...", { exact: true })).toBeHidden();
    const prodEnvironment = card.getByText("PROD", { exact: true });
    await expect(prodEnvironment).toBeVisible();
    await prodEnvironment.click();
    const createProdButton = card.getByRole("button", { name: "Create New Branch: PROD" });
    if (await createProdButton.isVisible()) {
      await createProdButton.click();
      await expect(createProdButton).toBeHidden();
    }
    await expectSnapshot(page, card, testInfo, "repo-created", viewportName);
    return card;
  });

  await test.step("Save the Azure subscription variables", async () => {
    const card = await expandAzureSubscriptionCard(page);
    await expect(card.getByText("Loading subscriptions...", { exact: true })).toBeHidden();
    await card.getByRole("button", { name: "Save 3 variables" }).click();
    await expect(card.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled();
    await expect.poll(() => github.variables).toEqual({
      AZURE_TENANT_ID: mockTenantId,
      AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
      VITE_AZURE_TENANT_ID: mockTenantId,
    });
    await expectSnapshot(page, card, testInfo, "subscription-saved", viewportName);
  });

  const appRegistrationCard = await test.step("Expand app registration card", async () => {
    return await expandAzureAppRegistrationCard(page);
  });

  await test.step("Create new app registration and grant access", async () => {
    const appNameInput = appRegistrationCard.locator("input:visible").first();
    await expect(appNameInput).toBeVisible();
    await appNameInput.fill(appName);
    await expectSnapshot(page, appRegistrationCard, testInfo, "app-prefilled", viewportName);
    await appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
    await expect(appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
    await expect(appRegistrationCard.getByRole("button", { name: "Try again" })).toBeVisible();
    for (const stepLabel of [
      "Confirm Microsoft permissions",
      "Create app registration",
      "Create service principal",
      "Switch GitHub OIDC to immutable subject",
      "Add federated credentials",
      "Assign RBAC roles",
    ]) {
      await expect(appRegistrationCard.getByText(stepLabel, { exact: true })).toBeVisible();
    }
    await expectSuccessfulSteps(appRegistrationCard, [
      "Confirm Microsoft permissions",
      "Create app registration",
      "Create service principal",
      "Switch GitHub OIDC to immutable subject",
      "Add federated credentials",
      "Assign RBAC roles",
    ]);
    await expect(appRegistrationCard.getByText(/Additional consent required|Consent redirect failed/i)).toHaveCount(0);
    expect(github.oidcSubjectUpdates).toEqual([
      {
        url: `${GITHUB_API_URL}/repos/mock-user/${repoName}/actions/oidc/customization/sub`,
        use_default: false,
        include_claim_keys: ["repo", "environment"],
        use_immutable_subject: true,
      },
    ]);
    expect(azure.federatedCredentialWrites).toEqual([
      {
        url: `${MICROSOFT_GRAPH_URL}/v1.0/applications/00000000-0000-0000-0000-000000000003/federatedIdentityCredentials`,
        name: `github-mock-user-${repoName}-prod-id`,
        issuer: "https://token.actions.githubusercontent.com",
        subject: `repo:mock-user@12345/${repoName}@987654321:environment:PROD`,
        audiences: ["api://AzureADTokenExchange"],
      },
    ]);
    expect(azure.roleAssignmentWrites).toEqual([
      {
        url: expect.stringContaining(`/subscriptions/${mockSubscriptionId}/providers/Microsoft.Authorization/roleAssignments/`),
        scope: `/subscriptions/${mockSubscriptionId}`,
        roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${mockReaderRoleId}`,
        principalId: mockServicePrincipalId,
        principalType: "ServicePrincipal",
      },
    ]);
    expect(azure.rbacAssigned).toBe(true);
    await expectSnapshot(page, appRegistrationCard, testInfo, "app-created", viewportName);
  });

  await test.step("Verify connection details were auto-saved", async () => {
    await expect(appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i)).toBeVisible();
    const connectionInputs = appRegistrationCard.locator('[data-sensitive="true"] input');
    await expect(connectionInputs).toHaveCount(2);
    const clientIds = await connectionInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.trim()));
    expect(clientIds[0], "AZURE_CLIENT_ID should be populated").not.toBe("");
    expect(clientIds[1], "AZURE_PLAN_CLIENT_ID should be populated").toBe(clientIds[0]);
    await expect(appRegistrationCard.getByText("2 not configured", { exact: true })).toHaveCount(0);
    expect(github.variables.AZURE_CLIENT_ID).toBe(clientIds[0]);
    expect(github.variables.AZURE_PLAN_CLIENT_ID).toBe(clientIds[0]);
    await expectSnapshot(page, appRegistrationCard, testInfo, "end", viewportName);
    await page.reload();
    const persistedCard = await expandAzureAppRegistrationCard(page);
    const persistedInputs = persistedCard.locator('[data-sensitive="true"] input');
    await expect(persistedInputs).toHaveCount(2);
    const persistedClientIds = await persistedInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.trim()));
    expect(persistedClientIds).toEqual([clientIds[0], clientIds[0]]);
    await expectSnapshot(page, persistedCard, testInfo, "persisted-after-reload", viewportName);
  });

  await expect(azureLoginCard.getByText(/Signed in as/i)).toBeVisible();
  await expect(repoCard.getByText("PROD", { exact: true })).toBeVisible();
}
