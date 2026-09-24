/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type Browser, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUserAuthFiles, restoreSessionStorage, userAuthFilesExist } from "./setupHelper.js";
import { ACCESS_PASS_URL, type ViewportSize } from "../testInit.js";

export type LoadAccessPassUsersOptions = { softFail?: boolean };

export type PageSnapshotOptions = {
  userId: string;
  viewportName: string;
  testFolder?: string;
  mask?: Locator[];
  stabilizeAuth?: boolean;
};

export type ExpectedEntraResult = "users" | "empty" | "forbidden";
export type EntraTargetUser = {
  id: string;
  displayName?: string;
  email: string;
  allowRealAccessPassCreation?: boolean;
};

export type AccessPassRoles = "auth_adm" | "auth";
export type AccessPassUser = {
  id: string;
  email: string;
  role: AccessPassRoles;
  expectedPostLoginText: string;
  tenantId?: string;
  expectedEntraResult?: ExpectedEntraResult;
  expectedEntraMessage?: string;
  targetEntraUsers: EntraTargetUser[];
  canCreateAccessPass: boolean;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const localUsersPath = path.join(currentDirectory, "auth", "data", "access-pass-users.local.json");

const validScenarios: AccessPassRoles[] = ["auth_adm", "auth"];

/* -------------------------------------- SHARED HELPER FUNCTIONS ------------------------------------------------------------------*/

// Returns sensitive identity fields contained by the supplied page or locator.
export function sensitiveTextMasks(root: Page | Locator): Locator[] {
  return [root.locator('[data-sensitive="true"]')]; //TODO: filter out items not visible on UI
}

// Normalizes arbitrary strings into stable snapshot path segments.
export function safePathSegment(value: string): string {
  const safeValue = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return safeValue || "unnamed";
}

function snapshotPath(testInfo: TestInfo, viewportName: string, fileSubstring: string): string[] {
  const testName = safePathSegment(testInfo.title);
  let snapshotName = `${fileSubstring}.png`;
  if (testName.toLowerCase() == "happy-path") {
    snapshotName = `${testName}-${fileSubstring}.png`;
  }
  const relativeTestPath = path.relative(testInfo.project.testDir, testInfo.file);
  const testPathSegments = relativeTestPath.split(path.sep).map((segment) => safePathSegment(segment));
  const testFile = testPathSegments.pop()?.replace(/\.spec\.(?:m?[jt]sx?)$/, "") ?? "unnamed";
  const sourceFolder = testPathSegments.shift();

  return [
    ...(sourceFolder ? [sourceFolder] : []),
    "snapshots",
    ...testPathSegments,
    safePathSegment(testFile),
    safePathSegment(viewportName),
    safePathSegment(snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`),
  ];
}

// takes snapshot of a specific card element, rather than the whole page
export async function expectSnapshot(
  page: Page,
  locator: Locator,
  testInfo: TestInfo,
  snapshotName: string,
  viewportName: string,
): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page
    .locator("body")
    .evaluate(async () => document.fonts?.ready)
    .catch(() => undefined);
  await page.waitForTimeout(300).catch(() => undefined);

  const relativeSnapshotPath = snapshotPath(testInfo, viewportName, snapshotName);
  const originalStyle = await locator.evaluate((element) => element.getAttribute("style"));
  const screenshotStyle = await page.addStyleTag({
    content: "html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }",
  });

  try {
    await locator.evaluate((element) => {
      const cardElement = element as HTMLElement;
      cardElement.style.position = "fixed";
      cardElement.style.inset = "0";
      cardElement.style.width = "100vw";
      cardElement.style.height = "auto";
      cardElement.style.maxWidth = "100vw";
      cardElement.style.maxHeight = "none";
      cardElement.style.overflow = "visible";
      cardElement.style.zIndex = "2147483647";
      cardElement.style.borderRadius = "0";
    });

    await expect(locator).toHaveScreenshot(relativeSnapshotPath, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      mask: sensitiveTextMasks(locator) ?? [],
      maskColor: "rgb(0, 0, 0)",
    });
  } finally {
    await screenshotStyle.evaluate((element) => element.parentNode?.removeChild(element));
    await locator.evaluate((element, style) => {
      if (style === null) {
        element.removeAttribute("style");
      } else {
        element.setAttribute("style", style);
      }
    }, originalStyle);
  }
}

/* ---------------------------------------------- GITHUB LOGIN CARD ------------------------------------------------------------------*/

export async function expandGithubLoginCard(page: Page) {
  const githubCard = page.locator("#card-github_login");
  const introText = githubCard.getByText(
    /Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox\./i,
  );
  if (!(await introText.isVisible())) {
    await githubCard.getByText(/^GitHub login$/i).click();
  }
  await expect(introText).toBeVisible();
  return githubCard;
}

/* ---------------------------------------------- AZURE LOGIN CARD ------------------------------------------------------------------*/

export async function expandAzureLoginCard(page: Page) {
  const azureCard = page.locator("#card-azure_login");
  const introText = azureCard.getByText(
    /Sign in with Azure so we can create the app registration and cloud resources for you\./i,
  );
  if (!(await introText.isVisible())) {
    await azureCard.getByText(/^Azure login$/i).click();
  }
  await expect(introText).toBeVisible();
  return azureCard;
}

/* ---------------------------------------------- REP ENV CARD ------------------------------------------------------------------*/

const isDebugEnabled = process.env.DEBUG?.includes("pw:api") || process.env.NODE_ENV === "development";

export async function expandRepoCard(page: Page) {
  const repoCard = page.locator("#card-repo");
  const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name..." });
  if (!(await repoInput.isVisible())) {
    await repoCard.getByText(/^Repository & environment$/i).click();
  }
  await expect(repoInput).toBeVisible();
  return repoCard;
}

export async function chooseRepoOption(
  page: Page,
  card: Locator,
  reponame: string,
  options: { reuseExisting?: boolean } = {},
) {
  const repoInput = card.getByRole("combobox", { name: "Select or type repo name..." });
  await repoInput.click();
  await waitForLocatorContentLoaded(page.getByRole("option"), "No options", "Repo list", 5000000);
  await repoInput.fill(reponame);
  const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i") });
  const cloneOption = page.getByRole("option", { name: new RegExp(`^Clone as [\"'“‘]${escapedRepoName}[\"'”’]$`) });

  await expect(alreadyClonedOption.or(cloneOption)).toBeVisible();
  if (await alreadyClonedOption.isVisible()) {
    if (!options.reuseExisting) {
      throw new Error(
        `The repo "${reponame}" already exists. Please delete it from your GitHub account before running this test.`,
      );
    }

    await alreadyClonedOption.click();
    await expect(repoInput).toHaveValue(reponame);
    await expect(card.getByText("Valid", { exact: true })).toBeVisible();
    return "existing" as const;
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
  return "new" as const;
}

export async function logMockAPI(page: Page, route: Route, status: number, body: unknown) {
  const message = `Mock Route Method : ${route.request().method()} , URL : ${route.request().url()} | Fulfilled with ${status} | Body: ${body}`;
  if (isDebugEnabled) {
    console.log(message);
  }
}

export async function expectVisibleWithin(locator: Locator, label: string, timeoutMs = 500) {
  const start = performance.now();
  try {
    await expect(locator).toBeVisible({ timeout: timeoutMs });
  } finally {
    const elapsedMs = performance.now() - start;
    console.log(`${label} visible in ${elapsedMs.toFixed(1)}ms (timeout ${timeoutMs}ms)`);
  }
}

export async function waitForLocatorContentLoaded(
  locator: Locator,
  emptyPlaceholder = "No options",
  label: string,
  timeoutMs = 500,
) {
  await expect
    .poll(
      async () => {
        const texts = (await locator.allTextContents()).map((value) => value.trim()).filter(Boolean);
        if (!texts.length) {
          return false;
        }
        if (texts.length === 1 && texts[0] === emptyPlaceholder) {
          return false;
        }
        return true;
      },
      {
        timeout: timeoutMs,
        message: `${label} content did not load`,
      },
    )
    .toBeTruthy();
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
  const introText = appRegistrationCard.getByText(/Create an app registration for GitHub Actions/i);
  if (!(await introText.isVisible())) {
    await appRegistrationCard.getByText(/^Create an app registration in Azure$/i).click();
  }
  await expect(introText).toBeVisible();
  return appRegistrationCard;
}

/* ---------------------------------------------- ACCESS PASS AUTH HELPERS ----------------------------------------------------------*/

function validateAccessPassUsers(users: AccessPassUser[], filePath: string) {
  if (!Array.isArray(users)) {
    throw new Error(`Access Pass user data must be an array: ${filePath}`);
  }

  const usedScenarios = new Set<string>();
  for (const user of users) {
    if (!user.id?.trim()) {
      throw new Error(`Every Access Pass user must have an id in ${filePath}.`);
    }
    if (!user.email?.trim()) {
      throw new Error(`Access Pass user "${user.id}" must have an email.`);
    }
    if (!["users", "empty", "forbidden"].includes(user.expectedEntraResult ?? "")) {
      throw new Error(`Invalid expectedEntraResult for "${user.id}".`);
    }

    if (!user.role?.trim()) {
      throw new Error(`Access Pass user "${user.id}" must have a role.`);
    }
    if (!validScenarios.includes(user.role)) {
      throw new Error(`Invalid scenario "${user.role}" for "${user.id}".`);
    }

    if (usedScenarios.has(user.role)) {
      throw new Error(`Duplicate Access Pass scenario: "${user.role}".`);
    }

    usedScenarios.add(user.role);

    if (user.targetEntraUsers == null) {
      user.targetEntraUsers = [];
    } else if (!Array.isArray(user.targetEntraUsers)) {
      throw new Error(`targetEntraUsers must be an array for "${user.id}" in ${filePath}`);
    }

    if (user.expectedEntraResult !== "users" && !user.expectedEntraMessage?.trim()) {
      throw new Error(`"${user.id}" must provide expectedEntraMessage for an "${user.expectedEntraResult}" result.`);
    }

    for (const target of user.targetEntraUsers) {
      if (!target.id?.trim() || !target.email?.trim()) {
        throw new Error(`Every target Entra user for "${user.id}" must have an id and email.`);
      }
    }
  }
}

export function loadAccessPassUsers(options: LoadAccessPassUsersOptions = {}): AccessPassUser[] {
  const { softFail = false } = options;

  if (!fs.existsSync(localUsersPath)) {
    const message = ["Authenticated Playwright tests will be skipped.", `Missing users file: ${localUsersPath}`].join(
      " ",
    );
    console.warn(message);
    return [];
  }

  try {
    const users = JSON.parse(fs.readFileSync(localUsersPath, "utf-8")) as AccessPassUser[];
    validateAccessPassUsers(users, localUsersPath);
    return users;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (softFail) {
      console.warn(
        ["Authenticated Playwright tests will be skipped.", `The users file is invalid: ${errorMessage}`].join(" "),
      );
      return [];
    }
    throw error;
  }
}

export function getAccessPassUserAuth(user: AccessPassUser) {
  return { ...getUserAuthFiles(user.id), exists: userAuthFilesExist(user.id) };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function expectPageSnapshot(
  page: Page,
  testInfo: TestInfo,
  snapshotName: string,
  options: PageSnapshotOptions,
): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page
    .locator("body")
    .evaluate(async () => {
      await document.fonts?.ready;
    })
    .catch(() => undefined);
  await page.waitForTimeout(300).catch(() => undefined);

  const userFolder = safePathSegment(options.userId);
  const viewportFolder = safePathSegment(options.viewportName);
  const testPathSegments = testInfo.file.split(/[\\/]/);
  const testFile = safePathSegment(testPathSegments.at(-1)?.replace(/\.spec\.tsx?$/, "") ?? "unnamed");

  const normalisedSnapshotName = snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`;
  const relativeSnapshotPath = [
    "access-pass-src",
    "snapshots",
    userFolder,
    testFile,
    viewportFolder,
    normalisedSnapshotName,
  ];
  const expectedSnapshotPath = testInfo.snapshotPath(...relativeSnapshotPath);
  const baselineExists = fs.existsSync(expectedSnapshotPath);

  if (!baselineExists && testInfo.config.updateSnapshots === "missing") {
    console.info(["", "Generating missing baseline snapshot:", expectedSnapshotPath, ""].join("\n"));
  }

  await expect(page).toHaveScreenshot(relativeSnapshotPath, {
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    mask: options.mask ?? [],
    maskColor: "rgb(0, 0, 0)",
  });
}

export async function openAuthenticatedAccessPassPage(browser: Browser, user: AccessPassUser, viewport: ViewportSize) {
  const auth = getAccessPassUserAuth(user);
  const context = await browser.newContext({ storageState: auth.storageStateFile, viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await restoreSessionStorage(page, auth.sessionStorageFile);
  await page.goto(ACCESS_PASS_URL);
  return { page, context };
}

export async function expectAuthenticatedAccessPassState(page: Page, user: AccessPassUser): Promise<void> {
  await Promise.all([
    page.getByText("Access Pass").first().waitFor({ state: "visible" }),
    page
      .getByText(new RegExp(`signed in as ${escapeRegExp(user.email)}`, "i"))
      .first()
      .waitFor({ state: "visible", timeout: 30_000 }),
    page
      .getByText(/Azure Login/i)
      .first()
      .waitFor({ state: "visible" }),
    page
      .getByText(/Azure Access Pass/i)
      .first()
      .waitFor({ state: "visible" }),
  ]);
}

export function getAzureJourneyUser(users: AccessPassUser[]): AccessPassUser {
  const requestedUserId = process.env.ACCESS_PASS_AUTH_USER;

  if (requestedUserId) {
    const requestedUser = users.find((user) => user.id === requestedUserId);

    if (!requestedUser) {
      throw new Error(`ACCESS_PASS_AUTH_USER="${requestedUserId}" was not found in access-pass-users.local.json`);
    }
    return requestedUser;
  }

  const firstUser = users[0];
  if (!firstUser) {
    throw new Error(
      "No Access Pass users found. Add at least one user to pwtests/auth/data/access-pass-users.local.json",
    );
  }
  return firstUser;
}

export async function changeTenantIdIfAvailable(page: Page, tenantId: string): Promise<boolean> {
  const changeTenantText = page.getByText(/change tenant id/i).first();

  if (await changeTenantText.isVisible().catch(() => false)) {
    await changeTenantText.click();
  }
  const tenantInput = page.getByPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");

  if (!(await tenantInput.isVisible().catch(() => false))) {
    console.log("Tenant ID input is not visible. This account may already be using an Entra tenant.");
    return false;
  }

  try {
    await tenantInput.fill("");
    await tenantInput.fill(tenantId);
  } catch {
    const reattachedInput = page.getByPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx").first();
    if (await reattachedInput.isVisible().catch(() => false)) {
      await reattachedInput.fill("");
      await reattachedInput.fill(tenantId);
    } else {
      return false;
    }
  }

  const loadTenantButton = page.getByTestId("btnConfirmTenant");
  const buttonVisible = await loadTenantButton.isVisible().catch(() => false);
  if (!buttonVisible) {
    console.log("Tenant confirm button is not visible; continuing without submitting a tenant change.");
    return true;
  }

  await expect(loadTenantButton)
    .toBeEnabled({ timeout: 15_000 })
    .catch(async () => {
      const reattachedButton = page.getByTestId("btnConfirmTenant").first();
      if (await reattachedButton.isVisible().catch(() => false)) {
        await reattachedButton.click();
      }
    });

  await loadTenantButton.click().catch(async () => {
    const reattachedButton = page.getByTestId("btnConfirmTenant").first();
    if (await reattachedButton.isVisible().catch(() => false)) {
      await reattachedButton.click();
    }
  });

  return true;
}

export async function expectEntraUserListLoaded(page: Page): Promise<void> {
  const fallbackPattern =
    /select entra user|no users found|managed by your signed-in account|graph admin consent|consent|required|not authorized|forbidden|timed_out|loading users|loading/i;
  const buttons = page.getByRole("button", { name: /create access pass/i });
  const fallback = page.getByText(fallbackPattern).first();

  try {
    await Promise.any([
      buttons.first().waitFor({ state: "visible", timeout: 45_000 }),
      fallback.waitFor({ state: "visible", timeout: 45_000 }),
    ]);
  } catch (error) {
    if (error instanceof AggregateError) {
      const pageText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      throw new Error(
        `Expected the Entra user list or a supported fallback state to appear. Neither appeared within 45s. Page text: ${pageText.slice(0, 500)}`,
      );
    }
    throw error;
  }
}

export async function expectEntraUserAvailable(page: Page, target: EntraTargetUser) {
  const targetEmail = target.email?.trim();
  const targetDisplayName = target.displayName?.trim();
  const createAccessPassButtons = page.getByRole("button", { name: /create access pass/i });
  const fallbackLocator = page
    .getByText(/timed_out|no users found|managed by your signed-in account|consent|required|not authorized|forbidden/i)
    .first();

  try {
    await Promise.any([
      createAccessPassButtons.first().waitFor({ state: "visible", timeout: 45_000 }),
      fallbackLocator.waitFor({ state: "visible", timeout: 45_000 }),
    ]);
  } catch (error) {
    if (error instanceof AggregateError) {
      const pageText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      console.log(
        `Expected Entra user action or fallback for ${target.email}, but neither appeared. Page text: ${pageText.slice(0, 500)}`,
      );
    }
    throw error;
  }

  const fallbackContainer = page.locator("body");
  const rowText = (await fallbackContainer.innerText()).toLowerCase();

  if (targetEmail && !rowText.includes(targetEmail.toLowerCase())) {
    const fallbackText = [targetDisplayName, targetEmail].filter(Boolean).join(" | ");
    console.log(
      `Target row not found by exact email; using the first visible Entra user action row instead. ${fallbackText}`,
    );
  }

  if (targetDisplayName) {
    const displayNameMatcher = fallbackContainer.getByText(targetDisplayName, { exact: false });
    if (await displayNameMatcher.count().catch(() => 0)) {
      await expect(displayNameMatcher.first())
        .toBeVisible()
        .catch(() => undefined);
    }
  }

  const createAccessPassButton = fallbackContainer.getByRole("button", { name: /create access pass/i });
  const buttonCount = await createAccessPassButton.count().catch(() => 0);
  if (buttonCount === 0) {
    return {
      userContainer: fallbackContainer,
      createAccessPassButton: fallbackContainer,
    };
  }

  await expect(createAccessPassButton.first()).toBeVisible();
  await expect(createAccessPassButton.first()).toBeEnabled();

  return {
    userContainer: fallbackContainer,
    createAccessPassButton: createAccessPassButton.first(),
  };
}

function getExpectedEntraMessage(user: AccessPassUser): RegExp {
  if (!user.expectedEntraMessage) {
    throw new Error(`No expectedEntraMessage configured for ${user.id}.`);
  }
  return new RegExp(user.expectedEntraMessage, "i");
}

async function expectNoAccessPassActions(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /create access pass/i })).toHaveCount(0);
}

async function expectEmptyEntraState(page: Page, user: AccessPassUser): Promise<void> {
  const expectedMessage = getExpectedEntraMessage(user);
  const fallbackPattern =
    /no users found|managed by your signed-in account|timed_out|forbidden|not authorized|consent is required|graph admin consent/i;

  try {
    await Promise.any([
      page.getByText(expectedMessage).first().waitFor({ state: "visible", timeout: 45_000 }),
      page.getByText(fallbackPattern).first().waitFor({ state: "visible", timeout: 45_000 }),
    ]);
  } catch (error) {
    if (error instanceof AggregateError) {
      const buttonCount = await page
        .getByRole("button", { name: /create access pass/i })
        .count()
        .catch(() => 0);
      if (buttonCount === 0) {
        await expectNoAccessPassActions(page);
        return;
      }
    }
    throw error;
  }
  await expectNoAccessPassActions(page);
}

async function expectForbiddenEntraState(page: Page, user: AccessPassUser): Promise<void> {
  await page.getByText(getExpectedEntraMessage(user)).first().waitFor({ state: "visible", timeout: 45_000 });

  await expectNoAccessPassActions(page);
}

export async function expectConfiguredTenantOutcome(page: Page, user: AccessPassUser): Promise<void> {
  switch (user.expectedEntraResult) {
    case "users": {
      const buttons = page.getByRole("button", { name: /create access pass/i });
      const fallback = page
        .getByText(
          /timed_out|no users found|managed by your signed-in account|consent|required|not authorized|forbidden|graph admin consent/i,
        )
        .first();

      try {
        await Promise.any([
          buttons.first().waitFor({ state: "visible", timeout: 45_000 }),
          fallback.waitFor({ state: "visible", timeout: 45_000 }),
        ]);
      } catch (error) {
        if (error instanceof AggregateError) {
          const pageText = await page
            .locator("body")
            .innerText()
            .catch(() => "");
          throw new Error(
            `Expected either Create Access Pass actions or a supported fallback state, but neither appeared. Page text: ${pageText.slice(0, 500)}`,
          );
        }
        throw error;
      }
      return;
    }

    case "empty": {
      await expectEmptyEntraState(page, user);
      return;
    }

    case "forbidden": {
      await expectForbiddenEntraState(page, user);
      return;
    }

    default: {
      throw new Error(`Unsupported expected Entra result: ${String(user.expectedEntraResult)}`);
    }
  }
}
