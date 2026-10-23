/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type BrowserContext, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import path from "node:path";
import { expectVisibleWithin, safePathSegment, waitForLocatorContentLoaded } from "../../util/testHelper";
import { CORP_URL, SUBSCRIPTION_ID, TEST_REPO_MAIN } from "../../testInit";
import {
  expandAzureAppRegistrationCard,
  expandAzureLoginCard,
  expandAzureSubscriptionCard,
  expandRepoCard,
  openRemoteTerminalCard,
} from "./cardHelper.mts";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "./setupHelper.mts";
import { coreInfraStepLabels, expectSuccessfulSteps } from "./mockTestHelper.mts";

export { getWebStorageAccountName } from "../../../corp-src/logic/naming.ts";

// Checks availability without selecting either an existing repository or a clone option.
export async function checkRepoExists(page: Page, card: Locator, reponame: string): Promise<boolean> {
  const repoInput = card.getByRole("combobox", { name: "Select or type repo name..." });
  await repoInput.click();
  await waitForLocatorContentLoaded(page.getByRole("option"), "No options", "Repo list", 5000000);
  await repoInput.fill(reponame);
  const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i") });
  const cloneOption = page.getByRole("option", { name: new RegExp(`^Clone as [\"'“‘]${escapedRepoName}[\"'”’]$`) });

  await expect(alreadyClonedOption.or(cloneOption)).toBeVisible();
  const repoExists = await alreadyClonedOption.isVisible();
  await repoInput.press("Escape");
  return repoExists;
}

export async function chooseExistingRepo(page: Page, card: Locator, reponame: string): Promise<void> {
  const repoInput = card.getByRole("combobox", { name: "Select or type repo name..." });
  await repoInput.click();
  await waitForLocatorContentLoaded(page.getByRole("option"), "No options", "Repo list", 5000000);
  await repoInput.fill(reponame);
  const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i") });

  await expect(alreadyClonedOption).toBeVisible();
  await alreadyClonedOption.click();
  await expect(repoInput).toHaveValue(reponame);
  await expect(card.getByText("Valid", { exact: true })).toBeVisible();
}

export async function createNewRepo(page: Page, card: Locator, reponame: string): Promise<void> {
  const repoInput = card.getByRole("combobox", { name: "Select or type repo name..." });
  await repoInput.click();
  await waitForLocatorContentLoaded(page.getByRole("option"), "No options", "Repo list", 5000000);
  await repoInput.fill(reponame);
  const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i") });
  const cloneOption = page.getByRole("option", { name: new RegExp(`^Clone as [\"'“‘]${escapedRepoName}[\"'”’]$`) });

  await expect(alreadyClonedOption.or(cloneOption)).toBeVisible();
  if (await alreadyClonedOption.isVisible()) {
    throw new Error(`The repo "${reponame}" already exists. Please delete it from your GitHub account before running this test.`);
  }

  await expectVisibleWithin(cloneOption, `Clone as ${reponame}`, 500);
  await cloneOption.click();
  // Confirm the option click changed the application's state.
  await expect(cloneOption).toBeHidden();
  await expect(repoInput).toHaveAttribute("aria-expanded", "false");
  await expectVisibleWithin(card.getByText("Clone from template"), "Clone from template", 500);
  await expect(card.getByRole("button", { name: "Clone Repository" })).toBeVisible();
  await expect(card.getByRole("switch", { name: "Private" })).toBeChecked();
  await expect(card.getByRole("switch", { name: "Clone all branches" })).not.toBeChecked();
  await expect(card.getByRole("switch", { name: "Create environments" })).toBeChecked();
  await expect(card.getByText(/Pick the environment to configure/i)).toHaveCount(0);
  await card.getByRole("button", { name: "Clone Repository" }).click();
  await expectVisibleWithin(card.getByText("Pick the environment to configure."), "Text: Pick the environment to configure", 500_000);
}

export async function selectCloneOption(page: Page, card: Locator, name: string) {
  const input = card.getByRole("combobox", { name: "Select or type repo name..." });
  await input.fill(name);
  await page.getByRole("option", { name: new RegExp(`^Clone as ["'“‘]${name}["'”’]$`) }).click();
  await expect(card.getByRole("button", { name: "Clone Repository", exact: true })).toBeEnabled();
  return card.getByRole("button", { name: "Clone Repository", exact: true });
}

export function connectionInput(card: Locator, key: string): Locator {
  const label = key === "VITE_AZURE_CLIENT_ID" ? "Sign-in App Client ID" : key;
  return card.getByText(label, { exact: true }).locator("../..").getByRole("textbox");
}

export async function openConnectionDetails(card: Locator): Promise<void> {
  const toggle = card.getByText("open to enter connection detail", { exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await expect(card.getByText("Connection details", { exact: true })).toBeVisible();
  await expect(card.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
}

export function remoteTerminalStepLabels(corpName: string, webStorageAccountName: string): string[] {
  return [
    "Register required Azure resource providers",
    `Create resource group root-${corpName}`,
    `Create Log Analytics workspace ${corpName}-terminal-law`,
    `Create Application Insights ${corpName}-terminal-ai`,
    `Create storage account ${corpName.toLowerCase()}term`,
    "Create sessions table",
    "Create deployment container",
    `Create storage account ${webStorageAccountName}`,
    "Allow this page to reach the blob service",
    "Consent to the storage data plane",
    "Enable static website hosting",
    "Grant yourself Storage Blob Data Contributor on it",
    "Create app registration Zeninstaller Private",
    "List Zeninstaller Private under enterprise applications",
    `Create Web PubSub ${corpName}-wpubsub`,
    "Configure hub terminal",
    "Create Flex Consumption plan",
    `Create Function App ${corpName}-terminal-app`,
    "Grant the Function App its data-plane roles",
    `Create app registration ${corpName}-terminal-pipeline`,
    `List ${corpName}-terminal-pipeline under enterprise applications`,
    "Add GitHub OIDC credentials for PROD, TEST",
    "Grant it Web PubSub Service Owner",
  ];
}

export async function prepareExistingRelayRepository(
  page: Page,
  context: BrowserContext,
  viewportName: string,
): Promise<{ card: Locator; corpName: string; tenantId: string; repoName: string }> {
  await restoreGithubSessionStorage(context);
  await restoreAzureSessionStorage(context);
  await page.goto(CORP_URL);
  const azureCard = await expandAzureLoginCard(page);
  const tenantSelect = azureCard.getByTestId("tenant-select");
  await expect(tenantSelect).toBeVisible({ timeout: 50_000 });
  const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
  expect(tenantId, "A restored Azure tenant is required").not.toBe("");
  await tenantSelect.click();
  await page.getByRole("option").filter({ hasText: tenantId }).click();

  const repoName = safePathSegment(`${TEST_REPO_MAIN}-${viewportName}`);
  const repoCard = await expandRepoCard(page);
  // Relay tests must reuse an existing repository, never clone one.
  await chooseExistingRepo(page, repoCard, repoName);
  await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
  await repoCard.getByText("PROD", { exact: true }).click();
  const subscriptionCard = await expandAzureSubscriptionCard(page);
  await expect(subscriptionCard.getByText(
    "Select a repository & environment to save the tenant and subscription to GitHub.", { exact: true },
  )).toHaveCount(0, { timeout: 60_000 });
  await expect(subscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden({ timeout: 60_000 });
  await subscriptionCard.getByRole("combobox").click();
  await page.getByRole("option").filter({ hasText: SUBSCRIPTION_ID }).click();
  await expect(subscriptionCard.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
  const subscriptionSave = subscriptionCard.getByRole("button", { name: /^Save\s+(?:\d+\s+)?variables?$/ });
  await expect(subscriptionSave).toBeVisible();
  if (await subscriptionSave.isEnabled()) await subscriptionSave.click();
  await expect(subscriptionCard.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });

  const appCard = await expandAzureAppRegistrationCard(page);
  const coreCard = page.locator("#card-core_infra");
  await coreCard.getByText("Terraform state backend", { exact: true }).click();
  const requirement = coreCard.getByText("Complete the Azure app registration", { exact: true });
  await expect(appCard.locator('[data-sensitive="true"] input')).toHaveCount(2, { timeout: 60_000 });
  await expect.poll(async () =>
    !(await requirement.isVisible()) ||
    await appCard.getByText(/\d+ not configured|doesn't exist in the selected tenant|Missing on the selected subscription|doesn't match AZURE_CLIENT_ID/i).count() > 0,
  { timeout: 60_000 }).toBe(true);
  if (await requirement.isVisible()) {
    await appCard.locator("input:visible").first().fill(`zeninstaller-${repoName}`);
    await appCard.getByRole("button", { name: /^(?:Create app registration|Grant Reader access on this subscription)$/ }).click();
    await expect(appCard.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 300_000 });
    await expect(requirement).toBeHidden({ timeout: 60_000 });
  }
  const companyInput = connectionInput(coreCard, "COMPANY_SHORT_CODE");
  await expect(companyInput).toBeVisible({ timeout: 60_000 });
  await expect(coreCard.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
  if (!(await companyInput.inputValue()).trim()) await companyInput.fill("pwtests");
  const corpName = (await companyInput.inputValue()).trim();
  const coreSave = coreCard.getByRole("button", { name: /^Save\s+(?:\d+\s+)?variables?$/ });
  if (await coreSave.isEnabled()) await coreSave.click();
  await expect(coreCard.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
  const card = await openRemoteTerminalCard(page);
  const coreRequirement = card.getByText("Set up Corp infrastructure", { exact: true });
  if (await coreRequirement.isVisible()) {
    await coreCard.getByRole("button", { name: /^(?:Create core infrastructure|Re-run setup)$/ }).click();
    await expect(coreCard.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
    await expectSuccessfulSteps(coreCard, coreInfraStepLabels(corpName));
  }
  await expect(card.getByText(/The relay behind the stage-card terminal:/)).toBeVisible({ timeout: 60_000 });
  return { card, corpName, tenantId, repoName };
}
