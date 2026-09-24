import { expect, type Browser, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authDir } from "./setupHelper.mts";

export type PageSnapshotOptions = {
	userId: string;
	viewportName: string;
	testFolder?: string;
	mask?: Locator[];
  	stabilizeAuth?: boolean;
};

// printing debug and API info when running test
const isDebugEnabled = process.env.DEBUG?.includes('pw:api') || process.env.NODE_ENV === 'development';

// Returns sensitive identity fields contained by the supplied page or locator.
export function sensitiveTextMasks(root: Page | Locator,): Locator[] {
	return [root.locator('[data-sensitive="true"]'),]; //TODO: filter out items not visible on UI
}

// Normalizes arbitrary strings into stable snapshot path segments.
export function safePathSegment(value: string,): string {
	const safeValue = value
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g,"-",)
		.replace(/^[-_.]+|[-_.]+$/g,"",);
	return safeValue || "unnamed";
}

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snapshotPath(testInfo: TestInfo, viewportName: string, fileSubstring: string,): string[] {
	const testName = safePathSegment(testInfo.title);
	let snapshotName = safePathSegment(`${fileSubstring}.png`);
	if (testName.toLowerCase() == "happy-path") {
		snapshotName = safePathSegment(`${testName}-${fileSubstring}.png`);
	}
	const relativeTestPath = path.relative(testInfo.project.testDir, testInfo.file);
	const testPathSegments = relativeTestPath.split(path.sep,).map((segment,) => safePathSegment(segment,),);
	const testFile = testPathSegments.pop()?.replace(/\.spec\.(?:m?[jt]sx?)$/, "",) ?? "unnamed";
	const sourceFolder = testPathSegments.shift();

	return [
		...(sourceFolder ? [sourceFolder,] : []), "snapshots", ...testPathSegments,
		safePathSegment(testFile,), safePathSegment(viewportName,),
		safePathSegment(snapshotName.endsWith(".png") ? snapshotName : safePathSegment(`${snapshotName}.png`)),
	];
}

// takes snapshot of a specific card element, rather than the whole page
export async function expectSnapshot(page: Page, locator: Locator, testInfo: TestInfo, snapshotName: string, viewportName: string,): Promise<void> {
	await page.waitForLoadState("domcontentloaded").catch(() => undefined);
	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.locator("body").evaluate(async () => document.fonts?.ready).catch(() => undefined);
	await page.waitForTimeout(300).catch(() => undefined);

	const relativeSnapshotPath = snapshotPath(testInfo, viewportName, snapshotName,);
	const originalStyle = await locator.evaluate((element,) => element.getAttribute("style"),);
	const screenshotStyle = await page.addStyleTag({
		content: "html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }",
	},);

	try {
		await locator.evaluate((element,) => {
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
		},);

		await expect(locator).toHaveScreenshot(relativeSnapshotPath, {
			animations: "disabled",
			caret: "hide", 
			maxDiffPixelRatio: 0.02,
			mask: sensitiveTextMasks(locator) ?? [],
			maskColor: "rgb(0, 0, 0)",
		},);
	} finally {
		await screenshotStyle.evaluate((element) => element.parentNode?.removeChild(element));
		await locator.evaluate((element, style) => {
			if (style === null) {
				element.removeAttribute("style");
			} else {
				element.setAttribute("style", style);
			}
		}, originalStyle,);
	}
}

// Checks availability without selecting either an existing repository or a clone option.
export async function checkRepoExists(page: Page, card: Locator, reponame: string): Promise<boolean> {
	const repoInput = card.getByRole("combobox", { name: "Select or type repo name...", });
	await repoInput.click();
	await waitForLocatorContentLoaded(page.getByRole("option",), "No options", "Repo list", 5000000);
	await repoInput.fill(reponame);
	const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&",);
	const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i",), });
	const cloneOption = page.getByRole("option", { name: new RegExp(`^Clone as [\"'“‘]${escapedRepoName}[\"'”’]$`,), });

	await expect(alreadyClonedOption.or(cloneOption)).toBeVisible();
	const repoExists = await alreadyClonedOption.isVisible();
	await repoInput.press("Escape");
	return repoExists;
}

export async function chooseExistingRepo(page: Page, card: Locator, reponame: string): Promise<void> {
	const repoInput = card.getByRole("combobox", { name: "Select or type repo name...", });
	await repoInput.click();
	await waitForLocatorContentLoaded(page.getByRole("option",), "No options", "Repo list", 5000000);
	await repoInput.fill(reponame);
	const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&",);
	const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i",), });

	await expect(alreadyClonedOption).toBeVisible();
	await alreadyClonedOption.click();
	await expect(repoInput).toHaveValue(reponame);
	await expect(card.getByText("Valid", { exact: true })).toBeVisible();
}

export async function createNewRepo(page: Page, card: Locator, reponame: string): Promise<void> {
	const repoInput = card.getByRole("combobox", { name: "Select or type repo name...", });
	await repoInput.click();
	await waitForLocatorContentLoaded(page.getByRole("option",), "No options", "Repo list", 5000000);
	await repoInput.fill(reponame);
	const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&",);
	const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i",), });
	const cloneOption = page.getByRole("option", { name: new RegExp(`^Clone as [\"'“‘]${escapedRepoName}[\"'”’]$`,), });

	await expect(alreadyClonedOption.or(cloneOption)).toBeVisible();
	if (await alreadyClonedOption.isVisible()) {
		throw new Error(`The repo "${reponame}" already exists. Please delete it from your GitHub account before running this test.`);
	}

	await expectVisibleWithin(cloneOption, `Clone as ${reponame}`, 500,);
	await cloneOption.click();
	// Confirm the option click changed the application's state.
	await expect(cloneOption).toBeHidden();
	await expect(repoInput).toHaveAttribute("aria-expanded", "false");
	await expectVisibleWithin(card.getByText("Clone from template",), "Clone from template", 500,);
	await expect(card.getByRole("button", { name: "Clone Repository" }),).toBeVisible();
	await expect(card.getByRole("switch", { name: "Private" }),).toBeChecked();
	await expect(card.getByRole("switch", { name: "Clone all branches" }),).not.toBeChecked();
	await expect(card.getByRole("switch", { name: "Create environments" }),).toBeChecked();
	await expect(card.getByText(/Pick the environment to configure/i),).toHaveCount(0);
	await card.getByRole("button", { name: "Clone Repository" }).click();
	await expectVisibleWithin(card.getByText("Pick the environment to configure."), "Text: Pick the environment to configure", 500_000,);
}

export async function logMockAPI(page: Page, route: Route, status: number, body: unknown) {
	const message = `Mock Route Method : ${route.request().method()} , URL : ${route.request().url()} | Fulfilled with ${status} | Body: ${body}`;
	if (isDebugEnabled) { console.log(message) }
}

export async function expectVisibleWithin(locator: Locator, label: string, timeoutMs = 500,) {
	const start = performance.now();
	try {
		await expect(locator,).toBeVisible({ timeout: timeoutMs, });
	} finally {
		const elapsedMs = performance.now() - start;
		console.log(`${label} visible in ${elapsedMs.toFixed(1)}ms (timeout ${timeoutMs}ms)`,);
	}
}

export async function waitForLocatorContentLoaded(locator: Locator, emptyPlaceholder = "No options", label: string, timeoutMs = 500,) {
	await expect.poll(async () => {
		const texts = (await locator.allTextContents()).map((value,) => value.trim()).filter(Boolean,);
		if (!texts.length) {
			return false;
		}
		if (texts.length === 1 && texts[0] === emptyPlaceholder) {
			return false;
		}
		return true;
	}, {
		timeout: timeoutMs,
		message: `${label} content did not load`,
	}).toBeTruthy();
}

export type LoadAccessPassUsersOptions = { softFail?: boolean };

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

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const localUsersPath = path.join(currentDirectory, "auth", "data", "access-pass-users.local.json");

function validateAccessPassUsers(users: AccessPassUser[], filePath: string): void {
	if (!Array.isArray(users)) {
		throw new Error(`Access Pass user data must be an array: ${filePath}`);
	}

	const usedRoles = new Set<AccessPassRoles>();
	for (const user of users) {
		if (!user.id?.trim()) throw new Error(`Every Access Pass user must have an id in ${filePath}.`);
		if (!user.email?.trim()) throw new Error(`Access Pass user "${user.id}" must have an email.`);
		if (!user.role || !["auth_adm", "auth"].includes(user.role)) {
			throw new Error(`Invalid role for "${user.id}".`);
		}
		if (usedRoles.has(user.role)) throw new Error(`Duplicate Access Pass role: "${user.role}".`);
		usedRoles.add(user.role);
		if (!user.expectedEntraResult || !["users", "empty", "forbidden"].includes(user.expectedEntraResult)) {
			throw new Error(`Invalid expectedEntraResult for "${user.id}".`);
		}
		if (user.targetEntraUsers == null) user.targetEntraUsers = [];
		if (!Array.isArray(user.targetEntraUsers)) {
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
		if (softFail) return [];
		throw new Error(`Missing users file: ${localUsersPath}`);
	}

	try {
		const users = JSON.parse(fs.readFileSync(localUsersPath, "utf8")) as AccessPassUser[];
		validateAccessPassUsers(users, localUsersPath);
		return users;
	} catch (error) {
		if (softFail) {
			console.warn(`Authenticated Access Pass tests could not load users: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
		throw error;
	}
}

function safeAuthFileName(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getAccessPassUserAuth(user: AccessPassUser) {
	const safeId = safeAuthFileName(user.id);
	const storageStateFile = path.join(authDir, `${safeId}.storage.json`);
	const sessionStorageFile = path.join(authDir, `${safeId}.session.json`);
	return {
		storageStateFile,
		sessionStorageFile,
		exists: fs.existsSync(storageStateFile) && fs.existsSync(sessionStorageFile),
	};
}

async function restoreSessionStorage(page: Page, sessionStorageFile: string): Promise<void> {
	if (!fs.existsSync(sessionStorageFile)) throw new Error(`Missing session storage file: ${sessionStorageFile}`);
	const storage = JSON.parse(fs.readFileSync(sessionStorageFile, "utf8")) as Record<string, string | null>;
	await page.addInitScript((sessionStorageData) => {
		for (const [key, value] of Object.entries(sessionStorageData)) {
			window.sessionStorage.setItem(key, value ?? "");
		}
	}, storage);
}

export async function openAuthenticatedAccessPassPage(browser: Browser, user: AccessPassUser, viewport: { width: number; height: number }) {
	const auth = getAccessPassUserAuth(user);
	const context = await browser.newContext({ storageState: auth.storageStateFile, viewport, deviceScaleFactor: 1 });
	const page = await context.newPage();
	await restoreSessionStorage(page, auth.sessionStorageFile);
	await page.goto("http://localhost:5173/accessPass.html");
	return { page, context };
}

export async function expectAuthenticatedAccessPassState(page: Page, user: AccessPassUser): Promise<void> {
	await Promise.all([
		page.getByText("Access Pass").first().waitFor({ state: "visible" }),
		page.getByText(new RegExp(`signed in as ${escapeRegExp(user.email)}`, "i")).first().waitFor({ state: "visible", timeout: 30_000 }),
		page.getByText(/Azure Login/i).first().waitFor({ state: "visible" }),
		page.getByText(/Azure Access Pass/i).first().waitFor({ state: "visible" }),
	]);
}

export async function expectPageSnapshot(page: Page, testInfo: TestInfo, snapshotName: string, options: PageSnapshotOptions): Promise<void> {
	await page.waitForLoadState("domcontentloaded").catch(() => undefined);
	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.waitForTimeout(300);
	const testPathSegments = testInfo.file.split(/[\\/]/);
	const testFile = safePathSegment(testPathSegments.at(-1)?.replace(/\.spec\.tsx?$/, "") ?? "test");
	const relativeSnapshotPath = [
		"access-pass-src",
		"snapshots",
		safePathSegment(options.userId),
		testFile,
		safePathSegment(options.viewportName),
		snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`,
	];
	await expect(page).toHaveScreenshot(relativeSnapshotPath, {
		fullPage: false,
		animations: "disabled",
		caret: "hide",
		mask: options.mask ?? [],
		maskColor: "rgb(0, 0, 0)",
	});
}

export async function changeTenantIdIfAvailable(page: Page, tenantId: string): Promise<boolean> {
	const changeTenantText = page.getByText(/change tenant id/i).first();
	if (await changeTenantText.isVisible().catch(() => false)) await changeTenantText.click();
	const tenantInput = page.getByPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
	if (!(await tenantInput.isVisible().catch(() => false))) return false;
	await tenantInput.fill(tenantId);
	const confirmButton = page.getByTestId("btnConfirmTenant");
	if (await confirmButton.isVisible().catch(() => false)) await confirmButton.click();
	return true;
}

export async function expectEntraUserListLoaded(page: Page): Promise<void> {
	const buttons = page.getByRole("button", { name: /create access pass/i });
	const fallback = page.getByText(/select entra user|no users found|managed by your signed-in account|consent|required|not authorized|forbidden|loading/i).first();
	await Promise.any([
		buttons.first().waitFor({ state: "visible", timeout: 45_000 }),
		fallback.waitFor({ state: "visible", timeout: 45_000 }),
	]);
}

export async function expectEntraUserAvailable(page: Page, target: EntraTargetUser) {
	const row = page.getByRole("row").filter({ hasText: target.email });
	await expect(row).toHaveCount(1, { timeout: 45_000 });
	const createAccessPassButton = row.getByRole("button", { name: /create access pass/i });
	await expect(createAccessPassButton).toBeVisible();
	await expect(createAccessPassButton).toBeEnabled();
	return { userContainer: row, createAccessPassButton };
}


