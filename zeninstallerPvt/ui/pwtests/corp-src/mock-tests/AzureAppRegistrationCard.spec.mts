/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureAppRegistration/AzureAppRegistrationCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL, GITHUB_API_URL, MICROSOFT_GRAPH_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot, safePathSegment } from "../../util/testHelper.ts";
import {
  expectSuccessfulSteps,
  installMockAzure,
  installMockGitHub,
  mockReaderRoleId,
  mockServicePrincipalId,
  mockSubscriptionId,
  mockTenantId,
  type MockAzureState,
} from "../util/mockTestHelper.mts";
import { expandAzureAppRegistrationCard, expandAzureLoginCard } from "../util/cardHelper.mts";

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Keeps creation disabled for blank app name", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-blank-${viewportName.toLowerCase()}`);
  const appNameInput = prepared.appRegistrationCard.getByRole("textbox", { name: "App registration name", exact: true });
  const createButton = prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" });
  await appNameInput.fill("   ");
  await expect(createButton).toBeDisabled();
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "blank-app-name-empty-state", viewportName);
});

test("Warns when the two saved client IDs differ", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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

test("Recovers from a provisioning failure", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-provision-retry-${viewportName.toLowerCase()}`, {
    initialAzureState: { applicationCreationFailuresRemaining: 1 },
  });
  const appNameInput = prepared.appRegistrationCard.getByRole("textbox", { name: "App registration name", exact: true });
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
    "Link Azure sign-in to this GitHub repository",
    "Add federated credentials",
    "Assign RBAC roles",
  ]);
  expect(prepared.azure.appDisplayName).toBe("mock-app-provision-retry");
  await expectSnapshot(page, prepared.appRegistrationCard, testInfo, "provisioning-recovered", viewportName);
});

test("Creating app when MS Graph permission denied", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-consent-rejected-${viewportName.toLowerCase()}`, {
    initialAzureState: { applicationLookupFailureStatus: 403 },
  });
  const appNameInput = prepared.appRegistrationCard.getByRole("textbox", { name: "App registration name", exact: true });
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
  const viewportName = getViewportName(testInfo);
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-retry-${viewportName.toLowerCase()}`);
  const appNameInput = prepared.appRegistrationCard.getByRole("textbox", { name: "App registration name", exact: true });
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

test("Warns when saved app is missing", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-missing-sp-${viewportName.toLowerCase()}`, {
    initialVariables: {
      AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_SUBSCRIPTION_ID: "mock-subscription",
      VITE_AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_CLIENT_ID: "mock-app-id",
      AZURE_PLAN_CLIENT_ID: "mock-app-id",
    },
    initialAzureResult: {
      clientId: "mock-app-id",
      tenantId: "00000000-0000-0000-0000-000000000001",
      subscriptionIds: ["mock-subscription"],
    },
  });
  const card = prepared.appRegistrationCard;
  await expect(card.getByText("This app registration doesn't exist in the selected tenant — create a new one.", { exact: true })).toBeVisible();
  await expect(card.locator('svg[data-testid="ErrorOutlineIcon"]')).toHaveCount(2);
  await expectSnapshot(page, card, testInfo, "saved-app-missing", viewportName);
});

test("Warns when there is no subscription role", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  const prepared = await prepareMockAppRegistrationCard(page, context, `mock-app-missing-role-${viewportName.toLowerCase()}`, {
    initialVariables: {
      AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_SUBSCRIPTION_ID: "mock-subscription",
      VITE_AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_CLIENT_ID: "mock-app-id",
      AZURE_PLAN_CLIENT_ID: "mock-app-id",
    },
    initialAzureState: { servicePrincipalCreated: true },
    initialAzureResult: {
      clientId: "mock-app-id",
      tenantId: "00000000-0000-0000-0000-000000000001",
      subscriptionIds: ["mock-subscription"],
    },
  });
  const card = prepared.appRegistrationCard;
  await expect(card.getByText(/Missing on the selected subscription:/)).toContainText("Reader");
  await expect(card.getByRole("button", { name: "Grant Reader access on this subscription" })).toBeVisible();
  await expectSnapshot(page, card, testInfo, "saved-app-role-missing", viewportName);
  await card.getByRole("button", { name: "Grant Reader access on this subscription" }).click();
  await expect(card.getByText(/Missing on the selected subscription:/)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Grant Reader access on this subscription" })).toHaveCount(0);
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
    "Link Azure sign-in to this GitHub repository",
    "Add federated credentials",
    "Assign RBAC roles",
  ]);
  await expectSnapshot(page, card, testInfo, "subscription-role-granted", viewportName);
});

test("Reports when connection details fail to auto-save", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
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
  const appNameInput = prepared.appRegistrationCard.getByRole("textbox", { name: "App registration name", exact: true });
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
  const viewportName = getViewportName(testInfo);
  const repoName = safePathSegment(`mock-azure-app-${viewportName.toLowerCase()}`);
  const appName = `zeninstaller-${repoName}`;
  const prepared = await prepareMockAppRegistrationCard(page, context, repoName);
  const { github, azure, appRegistrationCard } = prepared;
  await expect(appRegistrationCard.getByRole("button", { name: "Create app registration" })).toBeVisible();
  const azureLoginCard = await expandAzureLoginCard(page);
  await expect(azureLoginCard.getByRole("combobox", { name: /^Tenant\b/ })).toBeDisabled();
  await expect(azureLoginCard.getByRole("link", { name: /Show page to get Tenant ID/ })).toHaveCount(0);

  await test.step("Create new app registration and grant access", async () => {
    const appNameInput = appRegistrationCard.getByRole("textbox", { name: "App registration name", exact: true });
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
      "Link Azure sign-in to this GitHub repository",
      "Add federated credentials",
      "Assign RBAC roles",
    ]) {
      await expect(appRegistrationCard.getByText(stepLabel, { exact: true })).toBeVisible();
    }
    await expectSuccessfulSteps(appRegistrationCard, [
      "Confirm Microsoft permissions",
      "Create app registration",
      "Create service principal",
      "Link Azure sign-in to this GitHub repository",
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
    await expect(appRegistrationCard.getByRole("status").filter({ hasText: /Connection details saved(?: — no changes needed)?\./i })).toBeVisible();
    const detailsToggle = appRegistrationCard.locator('button[aria-controls="azure-app-registration-connection-details"]');
    await expect(detailsToggle).toHaveAttribute("aria-expanded", "true");
    await detailsToggle.press("Enter");
    await expect(detailsToggle).toHaveAttribute("aria-expanded", "false");
    await detailsToggle.press("Space");
    await expect(appRegistrationCard.getByRole("region", { name: "Connection details", exact: true })).toBeVisible();
    await expect(appRegistrationCard.getByRole("textbox", { name: "AZURE_CLIENT_ID", exact: true })).toHaveValue("00000000-0000-0000-0000-000000000002");
    await expect(appRegistrationCard.getByRole("textbox", { name: "AZURE_PLAN_CLIENT_ID", exact: true })).toHaveValue("00000000-0000-0000-0000-000000000002");
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

  expect(github.variables).toEqual(expect.objectContaining({
    AZURE_TENANT_ID: mockTenantId,
    AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
    VITE_AZURE_TENANT_ID: mockTenantId,
  }));
}

async function prepareMockAppRegistrationCard(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  repoName: string,
  options: {
    initialVariables?: Record<string, string>;
    initialAzureState?: Partial<MockAzureState>;
    initialAzureResult?: { clientId: string; tenantId: string; subscriptionIds: string[] };
  } = {}
) {
  const github = await installMockGitHub(page, context, {
    repositoryName: repoName,
    branches: ["main", "PROD"],
    initialVariables: {
      AZURE_TENANT_ID: mockTenantId,
      AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
      VITE_AZURE_TENANT_ID: mockTenantId,
      ...options.initialVariables,
    },
  });
  const azure = await installMockAzure(page, options.initialAzureState);

  if (options.initialAzureResult) {
    await context.addInitScript((result) => {
      localStorage.setItem("zeninstaller_azure_result", JSON.stringify(result));
    }, options.initialAzureResult);
  }
  await context.addInitScript((tenantId) => {
    sessionStorage.setItem("zeninstaller_arm_tenant", tenantId);
  }, mockTenantId);
  await page.route(/\/corp-src\/auth\/msal\.ts(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
      export const PINNED_TENANT_ID = "${mockTenantId}";
      export const LOGIN_AUTHORITY = "https://login.microsoftonline.com/${mockTenantId}";
      export const cleanTenantId = tenant => tenant?.trim().toLowerCase();
      const account = { homeAccountId: "mock-home", environment: "login.microsoftonline.com",
        tenantId: "${mockTenantId}", localAccountId: "mock-user", username: "mock-user@example.com",
        name: "Mock Azure User", tenantProfiles: new Map([["${mockTenantId}", {}]]) };
      export const getMsal = async () => ({ handleRedirectPromise: async () => null,
        getAllAccounts: () => [account], acquireTokenSilent: async () => ({ account, accessToken: "mock-token" }),
        loginRedirect: async () => { throw new Error("Unexpected authentication redirect in app-registration mock"); },
        acquireTokenRedirect: async () => { throw new Error("Unexpected authentication redirect in app-registration mock"); },
        clearCache: async () => {} });
      export const ensureScopeConsent = async () => false;
      export const getToken = async () => "mock-token";
      export const setActiveAzureIdentity = () => {};
      export const getMsToken = async () => "mock-token";
      export const requireMsToken = async () => "mock-token";
    `,
  }));

  const url = new URL(CORP_URL);
  url.search = new URLSearchParams({
    account: "mock-user",
    repo: repoName,
    env: "PROD",
    tenant: mockTenantId,
    subscription: mockSubscriptionId,
  }).toString();
  await page.goto(url.toString());
  const appRegistrationCard = await expandAzureAppRegistrationCard(page);
  return {
    github,
    azure,
    appRegistrationCard,
  };
}
