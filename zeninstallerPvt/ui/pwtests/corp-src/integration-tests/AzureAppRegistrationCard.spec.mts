/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureAppRegistrationCard.tsx
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "../util/setupHelper.mts";
import { checkRepoExists, chooseExistingRepo, createNewRepo } from "../util/testHelper.mts";
import { expectSnapshot, safePathSegment, expectVisibleWithin, attachJSCoverage } from "../../util/testHelper.ts";
import { CORP_URL, SUBSCRIPTION_ID, TEST_REPO_MAIN } from "../../testInit";
import { expandAzureAppRegistrationCard, expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard } from "../util/cardHelper.mts";

test.beforeEach(async ({ page }) => { await page.coverage.startJSCoverage({ resetOnNavigation: false }); });
test.afterEach(async ({ page }, testInfo) => { await attachJSCoverage(page, testInfo); });

test("Happy path", async ({ page, context }, testInfo) => {
  const { viewportName, repoName, appName } = await prepareTest(page, context, testInfo);
  await runHappyPath(page, testInfo, { viewportName, repoName, appName });
});

test("Reuses an existing app registration on retry", async ({ page, context }, testInfo) => {
  const { viewportName, repoName, appName } = await prepareTest(page, context, testInfo);
  const card = await prepareAppRegistrationCard(page, context, repoName);
  const appNameInput = card.locator("input:visible").first();

  await appNameInput.fill(appName);
  await card.getByRole("button", { name: "Create app registration" }).click();
  await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
  await expectVisibleWithin(card.getByRole("button", { name: "Try again" }), "Try again button", 50_000);
  await expectVisibleWithin(card.getByText("Create app registration", { exact: true }), "Create app registration step", 50_000);

  await card.getByRole("button", { name: "Try again" }).click();
  await expectVisibleWithin(appNameInput, "App registration name input", 50_000);
  await card.getByRole("button", { name: "Create app registration" }).click();
  await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
  await expectVisibleWithin(card.getByText(/Existing:/i), "Existing app registration indicator", 50_000);
  await expectVisibleWithin(card.getByText("Already exists", { exact: true }), "Already exists status", 50_000);
  await expectVisibleWithin(card.getByText(/Connection details saved(?: — no changes needed)?\./i), "Connection details saved status", 50_000);
  await expectSnapshot(page, card, testInfo, "existing-app-reused", viewportName);
});

async function prepareAppRegistrationCard(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext, repoName: string) {
  const azureLoginCard = await expandAzureLoginCard(page);
  const signedInText = azureLoginCard.getByText(/Signed in as/i);
  const tenantSelect = azureLoginCard.getByTestId("tenant-select");
  await expectVisibleWithin(signedInText, "Azure signed-in status", 50_000);
  await expectVisibleWithin(tenantSelect, "Azure tenant selector", 50_000);
  const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
  expect(tenantId, "The restored Azure tenant ID should not be empty").not.toBe("");
  await tenantSelect.click();
  await page.getByRole("option").filter({ hasText: tenantId }).click();
  const repoCard = await expandRepoCard(page);
  if (!(await checkRepoExists(page, repoCard, repoName))) {
    await createNewRepo(page, repoCard, repoName);
  }
  await chooseExistingRepo(page, repoCard, repoName);
  await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
  const prodEnvironment = repoCard.getByText("PROD", { exact: true });
  if (!(await prodEnvironment.isVisible())) {
    throw new Error(`The repository "${repoName}" does not have a visible PROD environment.`);
  }
  await prodEnvironment.click();
  const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
  const subscriptionCard = await expandAzureSubscriptionCard(page);
  const selectEnvironmentMessage = subscriptionCard.getByText(
    "Select a repository & environment to save the tenant and subscription to GitHub.",
    { exact: true },
  );
  await expect.poll(async () => await createProdButton.isVisible() || await selectEnvironmentMessage.count() === 0, {
    timeout: 30_000,
    message: "PROD branch state did not finish loading",
  }).toBeTruthy();
  if (await createProdButton.isVisible()) {
    await expect(createProdButton).toBeEnabled();
    await createProdButton.click();
    await expect(createProdButton).toBeHidden({ timeout: 30_000 });
    await expect(repoCard.getByText("Failed to create branch", { exact: true })).toHaveCount(0);
  }
  await expect(selectEnvironmentMessage).toHaveCount(0);
  await expect(subscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden({ timeout: 60_000 });
  await expectVisibleWithin(subscriptionCard.getByRole("combobox"), "Azure subscription selector", 50_000);
  const saveButton = subscriptionCard.getByRole("button", { name: /^Save(?: 2)? variables$/ });
  if ((await saveButton.count()) > 0 && await saveButton.isEnabled({ timeout: 0 })) {
    await saveButton.click();
    await expect(subscriptionCard.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled({ timeout: 60_000 });
  }
  return expandAzureAppRegistrationCard(page);
}

async function prepareTest(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext, testInfo: import("@playwright/test").TestInfo): Promise<{ viewportName: string; repoName: string; appName: string }> {
  const viewportName = testInfo.project.name;
  test.setTimeout(600_000);
  const runId = Date.now().toString(36);
  const repoName = safePathSegment(`${TEST_REPO_MAIN}-${viewportName}`);
  const appName = safePathSegment(`zeninstaller-${repoName}-${runId}`);
  await restoreGithubSessionStorage(context);
  await restoreAzureSessionStorage(context);
  await page.goto(CORP_URL);
  return { viewportName, repoName, appName };
}

async function runHappyPath(page: Page, testInfo: TestInfo, { viewportName, repoName, appName }: { viewportName: string; repoName: string; appName: string },): Promise<void> {
  const azureLoginCard = await test.step("Select the restored Azure tenant", async () => {
    const card = await expandAzureLoginCard(page);
    await expectSnapshot(page, card, testInfo, "start", viewportName);
    const signedInText = card.getByText(/Signed in as/i);
    const tenantSelect = card.getByTestId("tenant-select");
    await expectVisibleWithin(signedInText, "Azure signed-in status", 50_000);
    await expectVisibleWithin(tenantSelect, "Azure tenant selector", 50_000);
    const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
    expect(tenantId, "The restored Azure tenant ID should not be empty").not.toBe("");
    await tenantSelect.click();
    await page.getByRole("option").filter({ hasText: tenantId }).click();
    await expectSnapshot(page, card, testInfo, "tenant-selected", viewportName);
    return card;
  });

  const repoCard = await test.step("Expand the Repo Detail Card", async () => {
    const card = await expandRepoCard(page);
    return card;
  });

  await test.step("Create the repository if it does not exist", async (step) => {
    const repoExists = await checkRepoExists(page, repoCard, repoName);
    if (repoExists) {
      console.log(`Repository "${repoName}" already exists; skipping creation.`);
      step.skip(repoExists, `Repository "${repoName}" already exists; skipping creation.`);
    }
    await createNewRepo(page, repoCard, repoName);
  });

  await test.step("Select the existing repository", async () => {
    await chooseExistingRepo(page, repoCard, repoName);
  });

  await test.step("Select the PROD environment", async () => {
    await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
    const prodEnvironment = repoCard.getByText("PROD", { exact: true });
    await prodEnvironment.click();
    const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
    const subscriptionCard = await expandAzureSubscriptionCard(page);
    const selectEnvironmentMessage = subscriptionCard.getByText(
      "Select a repository & environment to save the tenant and subscription to GitHub.",
      { exact: true },
    );
    await expect.poll(async () => await createProdButton.isVisible() || await selectEnvironmentMessage.count() === 0, {
      timeout: 30_000,
      message: "PROD branch state did not finish loading",
    }).toBeTruthy();
    if (await createProdButton.isVisible()) {
      await expect(createProdButton).toBeEnabled();
      await createProdButton.click();
      await expect(createProdButton).toBeHidden({ timeout: 30_000 });
      await expect(repoCard.getByText("Failed to create branch", { exact: true })).toHaveCount(0);
    }
    await expect(selectEnvironmentMessage).toHaveCount(0);
    await expectSnapshot(page, repoCard, testInfo, "existing-repo", viewportName);
  });

  // TODO: check if tenant has subscriptions they can access (throw error if not)
  await test.step("Saving prefilled Azure subscription variables", async () => {
    const card = await expandAzureSubscriptionCard(page);
    await expectVisibleWithin(card.getByText(/Pick the subscription to deploy into\./i), "Subscription card prompt", 50_000);
    await expectVisibleWithin(card.getByText(/^Tenant:/i), "Text: Rendering Tenant", 50_000);
    await expectVisibleWithin(card.getByRole("button", { name: "Change on Azure login" }), "Button: Change on Azure Login", 5_000);
    await expectVisibleWithin(card.getByText(/^Subscription/i), "Text: Rendering Subscription text", 50_000);
    await expect(card.getByText("Loading subscriptions...")).toBeHidden({ timeout: 60_000 });
    const subscriptionSelect = card.getByRole("combobox");
    const noSubscriptionsMessage = card.getByText("This tenant has no subscriptions you can access.", { exact: true });
    await expectVisibleWithin(subscriptionSelect.or(noSubscriptionsMessage), "Subscription selector or empty-state message", 50_000);

    if (await subscriptionSelect.isVisible()) {
      console.log(`Selecting subscription "${SUBSCRIPTION_ID}" automatically.`);
      await subscriptionSelect.click();
      const subscriptionOption = page.getByRole("option").filter({ hasText: SUBSCRIPTION_ID });
      await expectVisibleWithin(subscriptionOption, `Subscription ${SUBSCRIPTION_ID} option`, 50_000);
      await subscriptionOption.click();
      await card.getByText(/Pick the subscription to deploy into\./i).click();
    }

    await expect(card.getByText("Select a repository & environment to save the tenant and subscription to GitHub.", { exact: true })).toHaveCount(0);
    const saveButton = card.getByRole("button", { name: /^Save(?: 2)? variables$/ });
    if ((await saveButton.count()) > 0 && await saveButton.isEnabled({ timeout: 0 })) {
      await saveButton.click();
      await expect(card.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled({ timeout: 60_000 });
    }
    await expectSnapshot(page, card, testInfo, "subscription-saved", viewportName);
  });

  const appRegistrationCard = await test.step("Expand app registration card", () => expandAzureAppRegistrationCard(page));

  await test.step("Create new app registration and grant access", async (step) => {
    const overwriteWarning = appRegistrationCard.getByText("This will overwrite your current connection details");
    if (await overwriteWarning.isVisible().catch(() => false)) {
      console.log("Existing connection details detected; skipping create-new flow.");
      step.skip(true, "Existing connection details are present; skipping create-new flow.");
    }

    const appNameInput = appRegistrationCard.locator("input:visible").first();
    await expectVisibleWithin(appNameInput, "App registration name input", 50_000);
    await appNameInput.fill(appName);
    await expectSnapshot(page, appRegistrationCard, testInfo, "new-app-prefilled", viewportName);
    await appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
    await expect(appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
    await expectVisibleWithin(appRegistrationCard.getByRole("button", { name: "Try again" }), "Try again button", 50_000);

    for (const stepLabel of [
      "Confirm Microsoft permissions",
      "Create app registration",
      "Create service principal",
      "Switch GitHub OIDC to immutable subject",
      "Add federated credentials",
      "Assign RBAC roles",
    ]) {
      await expectVisibleWithin(appRegistrationCard.getByText(stepLabel, { exact: true }), `App registration step: ${stepLabel}`, 50_000);
    }
    await expect(appRegistrationCard.getByText(/Additional consent required|Consent redirect failed/i)).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expectSnapshot(page, appRegistrationCard, testInfo, "app-created", viewportName);
  });

  await test.step("Overwrite existing app registration and grant access", async (step) => {
    const overwriteWarning = appRegistrationCard.getByText("This will overwrite your current connection details");
    if (!(await overwriteWarning.isVisible().catch(() => false))) {
      step.skip(true, "Overwrite warning is not present; there is nothing to overwrite.");
    }

    const appNameInput = appRegistrationCard.locator("input:visible").first();
    await expectVisibleWithin(appNameInput, "App registration name input", 50_000);
    await appNameInput.fill(appName);
    await expectSnapshot(page, appRegistrationCard, testInfo, "existing-app-prefilled", viewportName);
    await appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
    await expect(appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
    await expectVisibleWithin(appRegistrationCard.getByRole("button", { name: "Try again" }), "Try again button", 50_000);

    for (const stepLabel of [
      "Confirm Microsoft permissions",
      "Create app registration",
      "Create service principal",
      "Switch GitHub OIDC to immutable subject",
      "Add federated credentials",
      "Assign RBAC roles",
    ]) {
      await expectVisibleWithin(appRegistrationCard.getByText(stepLabel, { exact: true }), `App registration step: ${stepLabel}`, 50_000);
    }
    await expect(appRegistrationCard.getByText(/Additional consent required|Consent redirect failed/i)).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expectSnapshot(page, appRegistrationCard, testInfo, "app-created", viewportName);
  });

  await test.step("Verify connection details were auto-saved", async () => {
    await expectVisibleWithin(
      appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i),
      "Connection details saved status",
      50_000,
    );
    const connectionInputs = appRegistrationCard.locator('[data-sensitive="true"] input');
    await expect(connectionInputs).toHaveCount(2);
    const clientIds = await connectionInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.trim()));
    expect(clientIds[0], "AZURE_CLIENT_ID should be populated").not.toBe("");
    expect(clientIds[1], "AZURE_PLAN_CLIENT_ID should be populated").toBe(clientIds[0]);
    await expect(appRegistrationCard.getByText("2 not configured", { exact: true })).toHaveCount(0);
    await expectSnapshot(page, appRegistrationCard, testInfo, "end", viewportName);
  });

  console.log(`Created live Azure app registration test resources: ${appName} for ${repoName}`);
  await expectVisibleWithin(azureLoginCard.getByText(/Signed in as/i), "Azure signed-in status", 50_000);
  await expectVisibleWithin(repoCard.getByText("PROD", { exact: true }), "PROD environment", 50_000);
}
