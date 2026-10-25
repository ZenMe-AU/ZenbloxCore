/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/// <reference types="node" />
// UI component: ../../../corp-src/cards/BackendDeployCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import { backendBuild, expectSuccessfulSteps, installRelayNetworkGuard, prepareMockBackend, previousBuild } from "../util/mockTestHelper.mts";
import { backendStepLabels, openBackendCard } from "../util/cardHelper.mjs";

test.beforeEach(async ({ page }) => {
	await page.coverage.startJSCoverage({ resetOnNavigation: false });
});
test.afterEach(async ({ page }, testInfo) => {
	await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Reports a missing package without deploying", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, { missingArtifact: true });
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect(card.getByText("The latest build did not publish a package artifact.", { exact: true })).toBeVisible();
	expect(state.uploads).toBe(0);
	expect(state.settingsWrites).toBe(0);
	await expectSnapshot(page, card, testInfo, "missing-package", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reports a build permission failure", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, { failBuild: true });
	await card.getByRole("button", { name: "Build", exact: true }).click();
	await expect(card.getByRole("alert")).toHaveText("Failed to trigger workflow: 403");
	await expect(card.getByRole("button", { name: "Build", exact: true })).toBeEnabled();
	await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
	expect(state.uploads).toBe(0);
	await expectSnapshot(page, card, testInfo, "build-failed", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

for (const resourceGroup of ["existing-backend-rg", null]) {
	test(`Deploys using ${resourceGroup ?? "the private resource-group fallback"}`, async ({ page, context }, testInfo) => {
		const viewportName = getViewportName(testInfo);
		const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, {
			seedBuild: "update", resourceGroup,
		});
		await card.getByRole("button", { name: "Deploy", exact: true }).click();
		await expect.poll(() => state.uploads).toBe(1);
		await expect(card.getByRole("button", { name: "Deploying...", exact: true })).toHaveAttribute("aria-busy", "true");
		await page.clock.fastForward(5_001);
		await expect(card.getByText("The Function App is running the latest build.", { exact: true })).toBeVisible();
		expect(state.settingsWrites).toBe(1);
		expect(state.settings.BACKEND_SHA).toBe(backendBuild.sha);
		expect(unexpectedRequests).toEqual([]);
		await expectSnapshot(page, card, testInfo, resourceGroup ? "discovered-group" : "private-group-fallback", viewportName);
	});
}

test("Retries a failed upload without changing connection variables", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, github, initialVariables, unexpectedRequests } =
		await prepareMockBackend(page, context, viewportName, { failUploadOnce: true });
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect(card.locator('p:not([data-sensitive="true"])').filter({
		hasText: /^Deploying the package failed: 500 .*Mock upload failure$/,
	})).toBeVisible();
	expect(state.settingsWrites).toBe(0);
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect.poll(() => state.uploads).toBe(2);
	await expect(card.getByRole("button", { name: "Deploying...", exact: true })).toBeDisabled();
	await page.clock.fastForward(5_001);
	await expect(card.getByText("The Function App is running the latest build.", { exact: true })).toBeVisible();
	await expectSuccessfulSteps(card, backendStepLabels("pwtests-terminal-app"));
	await expect(card.getByText(/Mock upload failure/)).toHaveCount(0);
	expect(state.settingsWrites).toBe(1);
	expect(github.variables).toEqual(initialVariables);
	await expectSnapshot(page, card, testInfo, "recovered", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Prerequisite steps are shown", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const unexpectedRequests = await installRelayNetworkGuard(context);
	await page.goto(CORP_URL);
	const card = page.locator("#card-backend_deploy");
	await card.getByText("Private Zeninstaller Backend", { exact: true }).click();
	await expect(card.getByText("Sign in to Azure", { exact: true })).toBeVisible();
	await expect(card.getByRole("button", { name: /^(Build|Deploy)$/ })).toHaveCount(0);
	await expectSnapshot(page, card, testInfo, "authentication-required", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("No deployment option on the latest build", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, { seedBuild: "current" });
	await expect(card.getByText(/^Latest build:/)).toContainText(backendBuild.sha.slice(0, 7));
	await expect(card.getByText(/^Live on the app:/)).toContainText(backendBuild.sha.slice(0, 7));
	await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
	expect(state.uploads).toBe(0);
	expect(state.settingsWriteAttempts).toBe(0);
	await expectSnapshot(page, card, testInfo, "already-current", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Deployment available when the existing app version is older", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, { seedBuild: "update" });
	await expect(card.getByText(/^Latest build:/)).toContainText(backendBuild.sha.slice(0, 7));
	await expect(card.getByText(/^Live on the app:/)).toContainText("1234567");
	await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
	expect(state.uploads).toBe(0);
	await expectSnapshot(page, card, testInfo, "update-available", viewportName);
	expect(unexpectedRequests).toEqual([]);
});


test("Reports an expired build artifact without uploading", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, {
		seedBuild: "update", artifactDownloadStatus: 410,
	});
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect(card.locator('p:not([data-sensitive="true"])').filter({
		hasText: /^Failed to download the package: 410$/,
	})).toBeVisible();
	expect(state.downloads).toBe(1);
	expect(state.uploads).toBe(0);
	expect(state.settingsWriteAttempts).toBe(0);
	await expectSnapshot(page, card, testInfo, "expired-artifact", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reports an app deployment failure without recording the new version", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, {
		seedBuild: "update", deploymentOutcome: "failed",
	});
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect.poll(() => state.uploads).toBe(1);
	await expect(card.getByRole("button", { name: "Deploying...", exact: true })).toBeDisabled();
	await expect(card.getByRole("button", { name: "Deploying...", exact: true })).toHaveAttribute("aria-busy", "true");
	await page.clock.fastForward(5_001);
	await expect(card.locator('p:not([data-sensitive="true"])').filter({
		hasText: /^Deployment failed: Mock package unpack failure$/,
	})).toBeVisible();
	expect(state.uploads).toBe(1);
	expect(state.settingsWriteAttempts).toBe(0);
	expect(state.settings.BACKEND_VERSION).toBe(previousBuild.version);
	await expectSnapshot(page, card, testInfo, "deployment-failed", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reports a deployment polling timeout without recording the new version", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(180_000);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, {
		seedBuild: "update", deploymentOutcome: "timeout",
	});
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect.poll(() => state.uploads).toBe(1);
	const deploying = card.getByRole("button", { name: "Deploying...", exact: true });
	await expect(deploying).toBeDisabled();
	for (let poll = 0; poll < 125 && await deploying.isVisible(); poll++) {
		await page.clock.runFor(5_001);
	}
	expect(state.deploymentPollsAfterUpload).toBeGreaterThan(100);
	await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
	await expect(card.locator('p:not([data-sensitive="true"])').filter({
		hasText: "Deployment did not finish within 10 minutes",
	})).toBeVisible();
	expect(state.uploads).toBe(1);
	expect(state.settingsWriteAttempts).toBe(0);
	expect(state.settings.BACKEND_VERSION).toBe(previousBuild.version);
	await expectSnapshot(page, card, testInfo, "deployment-timeout", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reports app-settings write failure after a successful package deployment", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, {
		seedBuild: "update", failSettingsWrite: true,
	});
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect.poll(() => state.uploads).toBe(1);
	await expect(card.getByRole("button", { name: "Deploying...", exact: true })).toBeDisabled();
	await page.clock.fastForward(5_001);
	await expect(card.locator('p:not([data-sensitive="true"])').filter({
		hasText: /503 .*Mock app-settings write failure/,
	})).toBeVisible();
	expect(state.uploads).toBe(1);
	expect(state.settingsWriteAttempts).toBe(1);
	expect(state.settingsWrites).toBe(0);
	expect(state.settings.BACKEND_VERSION).toBe(previousBuild.version);
	await expectSnapshot(page, card, testInfo, "settings-write-failed", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reports a deployed-version read failure after saving settings", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, state, unexpectedRequests } = await prepareMockBackend(page, context, viewportName, {
		seedBuild: "update", failVersionRead: true,
	});
	await card.getByRole("button", { name: "Deploy", exact: true }).click();
	await expect.poll(() => state.uploads).toBe(1);
	await expect(card.getByRole("button", { name: "Deploying...", exact: true })).toBeDisabled();
	await page.clock.fastForward(5_001);
	await expect(card.locator('p:not([data-sensitive="true"])').filter({
		hasText: /503 .*Mock app-settings read failure/,
	})).toBeVisible();
	expect(state.settingsWrites).toBe(1);
	expect(state.settings.BACKEND_VERSION).toBe(backendBuild.version);
	expect(state.settings.BACKEND_SHA).toBe(backendBuild.sha);
	await expectSnapshot(page, card, testInfo, "version-read-failed", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(180_000);
	const { card, state, github, initialVariables, unexpectedRequests } = await prepareMockBackend(page, context, viewportName);
	await expect(card.getByText(/^Latest build:/)).toContainText("none yet");
	await expect(card.getByText(/^Live on the app:/)).toContainText("nothing deployed");
	await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
	await expectSnapshot(page, card, testInfo, "start", viewportName);
	await test.step("Build the backend using the existing PROD environment", async () => {
		await card.getByRole("button", { name: "Build", exact: true }).click();
		await expect(card.getByRole("button", { name: "Building...", exact: true })).toBeDisabled();
		await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
		await expect.poll(() => state.dispatches.length).toBe(1);
		await page.clock.fastForward(30_001);
		await expect(card.getByRole("button", { name: "Build", exact: true })).toBeEnabled();
		await expect(card.getByText(/^Latest build:/)).toContainText("abcdef1");
		await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
		expect(state.dispatches).toEqual([{ ref: "PROD", inputs: { github_env_name: "PROD" } }]);
		expect(state.latestBuild?.runId).toBe(backendBuild.runId);
		await expectSnapshot(page, card, testInfo, "built", viewportName);
	});
	await test.step("Deploy the built package to the existing Function App", async () => {
		await card.getByRole("button", { name: "Deploy", exact: true }).click();
		await expect.poll(() => state.uploads).toBe(1);
		await expect(card.getByRole("button", { name: "Build", exact: true })).toBeDisabled();
		await expect(card.getByRole("button", { name: "Deploying...", exact: true })).toBeDisabled();
		await page.clock.fastForward(5_001);
		await expect(card.getByText("The Function App is running the latest build.", { exact: true })).toBeVisible();
		await expectSuccessfulSteps(card, backendStepLabels("pwtests-terminal-app"));
		await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
		expect(state.downloads).toBe(1);
		expect(state.settingsWrites).toBe(1);
		expect(state.settings).toEqual({
			ALLOWED_ORIGINS: new URL(CORP_URL).origin, SESSION_TABLE_NAME: "sessions",
			WEBPUBSUB_ENDPOINT: "pwtests-wpubsub.webpubsub.azure.com",
			BACKEND_VERSION: backendBuild.version, BACKEND_SHA: backendBuild.sha, BACKEND_BUILT_AT: String(backendBuild.builtAt),
		});
		await expectSnapshot(page, card, testInfo, "deployed", viewportName);
	});
	await test.step("Read back the deployed version after reload", async () => {
		await page.reload();
		await openBackendCard(page);
		await expect(card.getByText(/^Live on the app:/)).toContainText("abcdef1");
		await expect(card.getByText("The Function App is running the latest build.", { exact: true })).toBeVisible();
		await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
		expect(state.uploads).toBe(1);
		expect(github.variables).toEqual(initialVariables);
		await expectSnapshot(page, card, testInfo, "persisted", viewportName);
	});
	expect(unexpectedRequests, "No unmocked external calls or prerequisite writes").toEqual([]);
}
