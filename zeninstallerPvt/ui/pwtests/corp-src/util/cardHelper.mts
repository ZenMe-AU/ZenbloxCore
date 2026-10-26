/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type Locator, type Page } from "@playwright/test";

export async function expandCard(card: Locator) {
  const toggle = card.locator("h3").getByRole("button");
  await expect(toggle).toHaveAttribute("aria-expanded", /^(true|false)$/);
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

export async function expandGithubLoginCard(page: Page) {
  const githubCard = page.locator("#card-github_login");
  const introText = githubCard.getByText(
    /Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox\./i
  );
  if (!(await introText.isVisible())) {
    await expandCard(githubCard);
  }
  await expect(introText).toBeVisible();
  return githubCard;
}

export async function expandGithubSignupCard(page: Page) {
  const card = page.locator("#card-github_signup");
  const email = card.getByRole("textbox", { name: "Email address" });
  if (!(await email.isVisible())) {
    await card.getByText("GitHub Sign Up", { exact: true }).click();
  }
  await expect(email).toBeVisible();
  return card;
}

export async function expandAzureLoginCard(page: Page) {
  const azureCard = page.locator("#card-azure_login");
  const introText = azureCard.getByText(/Sign in with Azure so we can create the app registration and cloud resources for you\./i);
  if (!(await introText.isVisible())) {
    await expandCard(azureCard);
  }
  await expect(introText).toBeVisible();
  return azureCard;
}

export async function expandRepoCard(page: Page) {
  const repoCard = page.locator("#card-repo");
  const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name..." });
  if (!(await repoInput.isVisible())) {
    await expandCard(repoCard);
  }
  await expect(repoInput).toBeVisible();
  return repoCard;
}

export async function expandAzureSubscriptionCard(page: Page) {
  const subscriptionCard = page.locator("#card-azure_subscription");
  const introText = subscriptionCard.getByText(/Pick the subscription to deploy into\./i);
  if (!(await introText.isVisible())) {
    await expandCard(subscriptionCard);
  }
  await expect(introText).toBeVisible();
  return subscriptionCard;
}

export async function expandAzureAppRegistrationCard(page: Page) {
  const appRegistrationCard = page.locator("#card-azure_app_registration");
  const introText = appRegistrationCard.getByText(/Create a Microsoft Entra app registration for GitHub Actions/i);
  if (!(await introText.isVisible())) {
    await expandCard(appRegistrationCard);
  }
  await expect(introText).toBeVisible();
  return appRegistrationCard;
}

export async function openBackendCard(page: Page) {
  const card = page.locator("#card-backend_deploy");
  await expect(card).toBeVisible();
  await expandCard(card);
  await expect(card.getByText(/Builds the Zeninstaller backend in GitHub Actions/)).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText(/checking\.\.\./)).toHaveCount(0, { timeout: 60_000 });
  return card;
}

export function backendStepLabels(appName: string) {
  return ["Download the built package", `Upload it to ${appName}`, "Wait for the Function App to unpack it"];
}

export async function openRemoteTerminalCard(page: Page) {
  const card = page.locator("#card-remote_terminal_infra");
  const description = card.getByText(/The relay behind the stage-card terminal:/);
  await expandCard(card);
  await expect(description).toBeVisible({ timeout: 60_000 });
  return card;
}
