/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { expectVisibleWithin, waitForLocatorContentLoaded } from "../../util/testHelper";
import { getVariableDisplayName } from "../../../corp-src/logic/variables.ts";

export { getWebStorageAccountName } from "../../../corp-src/logic/naming.ts";
export { prepareExistingRelayRepository, remoteTerminalStepLabels } from "./RemoteTerminalInfraCardHelper.mts";

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
  return card.getByRole("textbox", { name: getVariableDisplayName(key), exact: true });
}

export async function openConnectionDetails(card: Locator): Promise<void> {
  const details = card.getByRole("region", { name: "Connection details", exact: true, includeHidden: true });
  const detailsId = await details.getAttribute("id");
  if (!detailsId) throw new Error("Connection details must have a disclosure target ID.");
  const toggle = card.locator(`button[aria-controls="${detailsId}"]`);
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByRole("region", { name: "Connection details", exact: true })).toBeVisible();
  await expect(card.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
}
