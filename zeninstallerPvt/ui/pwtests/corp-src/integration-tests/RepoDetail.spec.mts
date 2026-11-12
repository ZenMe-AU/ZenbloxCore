/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/RepoDetail.tsx
import { expect, type Page, type Locator } from "@playwright/test";
import { getViewportName, test } from "../../../../../.playwright/viewportFixture.mjs";
import { restoreGithubSessionStorage } from "../util/setupHelper.mts";
import { CORP_URL, TEST_REPO_FROM_PROD, TEST_REPO_MAIN, TEST_REPO_NO_ENV } from "../../testInit";
import { checkRepoExists, chooseExistingRepo, createNewRepo } from "../util/testHelper.mts";
import { expectSnapshot, safePathSegment, expectVisibleWithin, waitForLocatorContentLoaded } from "../../../../../.playwright/testHelper.js";
import { expandRepoCard } from "../util/cardHelper.mts";

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Creates valid repo with no environments", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  await restoreGithubSessionStorage(context);
  await page.goto(CORP_URL);
  const reponame = safePathSegment(`${TEST_REPO_NO_ENV}-${viewportName}`);
  const repoCard = await expandRepoCard(page,);
  const repoExists = await checkRepoExists(page, repoCard, reponame);
  if (repoExists) {
    await chooseExistingRepo(page, repoCard, reponame);
  }

  if (!repoExists) {
    const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name..." });
    await repoInput.click();
    await waitForLocatorContentLoaded(page.getByRole("option"), "No options", "Repo list", 5000000);
    await repoInput.fill(reponame);
    const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i") });
    const cloneOption = page.getByRole("option", { name: new RegExp(`^Clone as [\"'“‘]${escapedRepoName}[\"'”’]$`) });
    await expectVisibleWithin(alreadyClonedOption.or(cloneOption), "Existing repo or clone option", 50_000);
    if (await alreadyClonedOption.isVisible()) {
      throw new Error(`The repo "${reponame}" already exists. Please delete it from your GitHub account before running this test.`);
    }
    await expectVisibleWithin(cloneOption, `Clone as ${reponame}`, 50_000);
    await cloneOption.click();
    // Confirm the option click changed the application's state.
    await expect(cloneOption).toBeHidden();
    await expect(repoInput).toHaveAttribute("aria-expanded", "false");
    await expectVisibleWithin(repoCard.getByText("Clone from template"), "Clone from template", 50_000);
    const createEnvironmentsSwitch = repoCard.getByRole("switch", { name: "Create environments" });
    await expect(createEnvironmentsSwitch).toBeChecked();
    await createEnvironmentsSwitch.click();
    await expect(createEnvironmentsSwitch).not.toBeChecked();
    const cloneRepoButton = repoCard.getByRole("button", { name: "Clone Repository" });
    await cloneRepoButton.click();
  }

  await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
  await expectVisibleWithin(repoCard.getByText("Valid", { exact: true }), "Repository validation", 50_000);
  await expectVisibleWithin(repoCard.getByText(/^No PROD or TEST environment was found/), "No environment message", 50_000);
  await expect(repoCard.getByRole("button", { name: "Clone Repository" })).toHaveCount(0);

  await expectSnapshot(page, repoCard, testInfo, "repo-no-env", viewportName);
});

test("Creates PROD branch, then creates TEST from PROD", async ({ page, context }, testInfo) => {
  const viewportName = getViewportName(testInfo);
  test.setTimeout(300_000);
  const repoName = safePathSegment(`${TEST_REPO_FROM_PROD}-${viewportName}`,);
  await restoreGithubSessionStorage(context);
  await page.goto(CORP_URL);
  const repoCard = await expandRepoCard(page,);
  const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", });

  const repoExists = await checkRepoExists(page, repoCard, repoName);
  if (repoExists) {
    throw new Error(`The repo "${repoName}" already exists. Please delete it from your GitHub account before running this test.`);
  }
  await createNewRepo(page, repoCard, repoName);
  await chooseExistingRepo(page, repoCard, repoName);
  await expect(repoInput).toHaveValue(repoName);
  const PROD = repoCard.getByRole("button", { name: "PROD", exact: true });
  const TEST = repoCard.getByRole("button", { name: "TEST", exact: true });
  await expect(repoCard.getByText("Loading environments...", { exact: true, })).toBeHidden();
  await expectVisibleWithin(PROD, "PROD environment", 50_000);
  await expectVisibleWithin(TEST, "TEST environment", 50_000);

  await PROD.click();
  const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
  await expectVisibleWithin(createProdButton, "Create PROD branch button", 50_000);
  await createProdButton.click();
  await expect(repoCard.getByText(/^No branch found matching environment "PROD"\.$/)).toHaveCount(0);

  await TEST.click();
  const createTestButton = repoCard.getByRole("button", { name: "Create New Branch: TEST" });
  await expectVisibleWithin(createTestButton, "Create TEST branch button", 50_000);
  const sourceBranchSelect = createTestButton.locator("..").getByRole("combobox");
  await sourceBranchSelect.click();
  await page.getByRole("option", { name: "PROD", exact: true }).click();
  await expect(sourceBranchSelect).toHaveText(/PROD/);

  await expectSnapshot(page, repoCard, testInfo, "prod-from-test-branch", viewportName);

  await createTestButton.click();
  await expect(createTestButton).toBeHidden({ timeout: 50_000 });
  await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/)).toHaveCount(0);

  await expectSnapshot(page, repoCard, testInfo, "prod-from-test-cloned", viewportName);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  const viewportName = getViewportName(testInfo);
  test.setTimeout(300_000);
  const repoName = safePathSegment(`${TEST_REPO_MAIN}-${viewportName}`);
  await restoreGithubSessionStorage(context);
  await page.goto(CORP_URL);

  const repoCard = await test.step("Expand the Repo Detail Card", async () => {
    const repoCard = await expandRepoCard(page);
    return repoCard;
  });

  await test.step("Create the repository if it does not exist", async (step) => {
    const repoExists = await checkRepoExists(page, repoCard, repoName);
    if (repoExists) {
      console.log(`Repository "${repoName}" already exists; skipping creation.`);
      step.skip(repoExists, `Repository "${repoName}" already exists; skipping creation.`);
    }
    await createNewRepo(page, repoCard, repoName);
  });

  await test.step("Select the existing repository", async (step) => {
    await chooseExistingRepo(page, repoCard, repoName);
  });

  await test.step("Creates new PROD branch from main", async () => {
    const PROD = repoCard.getByRole("button", { name: "PROD", exact: true });
    const TEST = repoCard.getByRole("button", { name: "TEST", exact: true });
    await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
    await expectVisibleWithin(PROD, "PROD environment", 50_000);
    await expectVisibleWithin(TEST, "TEST environment", 50_000);
    await PROD.click();
    await expect(PROD).toHaveAttribute("aria-pressed", "true");
    await expect(TEST).toHaveAttribute("aria-pressed", "false");
    const missingProdBranch = repoCard.getByText(/^No branch found matching environment "PROD"\.$/);
    if (await missingProdBranch.isVisible()) {
      const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD", });
      await expectVisibleWithin(createProdButton, "Button: Create New Branch: PROD", 50_000);
      await expect(createProdButton).toBeEnabled();
      await createProdButton.click();
      await expect(createProdButton).toBeHidden({ timeout: 50_000, });
      await expect(missingProdBranch).toHaveCount(0);
    }
    await expect(repoCard.getByText("Failed to create branch", { exact: true, }),).toHaveCount(0);
    await expectSnapshot(page, repoCard, testInfo, "prod-cloned", viewportName);
  });

  await test.step("Creates new TEST branch from main", async () => {
    const PROD = repoCard.getByRole("button", { name: "PROD", exact: true });
    const TEST = repoCard.getByRole("button", { name: "TEST", exact: true });
    await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
    await expectVisibleWithin(PROD, "PROD environment", 50_000);
    await expectVisibleWithin(TEST, "TEST environment", 50_000);
    await TEST.click();
    await expect(TEST).toHaveAttribute("aria-pressed", "true");
    await expect(PROD).toHaveAttribute("aria-pressed", "false");
    const missingTestBranch = repoCard.getByText(/^No branch found matching environment "TEST"\.$/);
    if (await missingTestBranch.isVisible()) {
      const createTestButton = repoCard.getByRole("button", { name: "Create New Branch: TEST", });
      await expectVisibleWithin(createTestButton, "Button: Create New Branch: TEST", 50_000);
      await expect(createTestButton).toBeEnabled();
      await createTestButton.click();
      await expect(createTestButton).toBeHidden({ timeout: 30_000, });
      await expect(missingTestBranch).toHaveCount(0);
    }
    await expect(repoCard.getByText("Failed to create branch", { exact: true, }),).toHaveCount(0);
    await expectSnapshot(page, repoCard, testInfo, "end", viewportName);
  });
}
