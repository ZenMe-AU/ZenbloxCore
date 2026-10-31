/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type Page } from "@playwright/test";

export async function expandGithubLoginCard(page: Page) {
  const githubCard = page.locator("#card-github_login");
  const introText = githubCard.getByText(
    /Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox\./i
  );
  if (!(await introText.isVisible())) {
    await githubCard.getByText(/^GitHub login$/i).click();
  }
  await expect(introText).toBeVisible();
  return githubCard;
}

export async function expandAzureLoginCard(page: Page) {
  const azureCard = page.locator("#card-azure_login");
  const introText = azureCard.getByText(/Sign in with a Microsoft account that can access the Entra tenant you want to configure\./i);
  if (!(await introText.isVisible())) {
    await azureCard.getByText(/^Azure login$/i).click();
  }
  await expect(introText).toBeVisible();
  return azureCard;
}

export async function expandRepoCard(page: Page) {
  const repoCard = page.locator("#card-repo");
  const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name..." });
  if (!(await repoInput.isVisible())) {
    await repoCard.getByText(/^Repository & environment$/i).click();
  }
  await expect(repoInput).toBeVisible();
  return repoCard;
}

export async function expandAzureSubscriptionCard(page: Page) {
  const subscriptionCard = page.locator("#card-azure_subscription");
  const introText = subscriptionCard.getByText(/Pick the subscription to deploy into\./i);
  if (!(await introText.isVisible())) {
    await subscriptionCard.getByText(/^Choose Azure subscription$/i).click();
  }
  await expect(introText).toBeVisible();
  return subscriptionCard;
}

export async function expandAzureAppRegistrationCard(page: Page) {
  const appRegistrationCard = page.locator("#card-azure_app_registration");
  const introText = appRegistrationCard.getByText(/Creates an Entra app for GitHub Actions to use when planning Terraform changes/i);
  if (!(await introText.isVisible())) {
    await appRegistrationCard.getByText(/^Create an app registration in Azure$/i).click();
  }
  await expect(introText).toBeVisible();
  return appRegistrationCard;
}

export async function openBackendCard(page: Page) {
  const card = page.locator("#card-backend_deploy");
  await expect(card).toBeVisible();
  if (await card.locator('svg[data-testid="ExpandMoreIcon"]').count()) {
    await card.getByText("Private Zeninstaller Backend", { exact: true }).click();
  }
  await expect(card.getByText(/Builds the Zeninstaller backend in GitHub Actions/)).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText(/checking\.\.\./)).toHaveCount(0, { timeout: 60_000 });
  return card;
}

export function backendStepLabels(appName: string) {
  return ["Download the built package", `Upload it to ${appName}`, "Wait for the Function App to unpack it"];
}

export async function openRemoteTerminalCard(page: Page) {
  const card = page.locator("#card-remote_terminal_infra");
  const description = card.getByText(/Creates the Azure services behind deployment-stage terminals\./);
  if (await card.locator('svg[data-testid="ExpandMoreIcon"]').count()) {
    await card.getByText("Private Zeninstaller Backend Environment", { exact: true }).click();
  }
  await expect(description).toBeVisible({ timeout: 60_000 });
  return card;
}
