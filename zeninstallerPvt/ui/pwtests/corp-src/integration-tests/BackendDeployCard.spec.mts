/// <reference types="node" />
// UI component: ../../../corp-src/cards/BackendDeployCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import { expectSuccessfulSteps, prepareExistingBackend } from "../util/mockTestHelper.mts";
import { backendStepLabels, openBackendCard } from "../util/cardHelper.mts";

test.beforeEach(async ({ page }) => {
	await page.coverage.startJSCoverage({ resetOnNavigation: false });
});
test.afterEach(async ({ page }, testInfo) => {
	await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Prerequisite steps listed before auth", async ({ page }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	await page.goto(CORP_URL);
	const card = page.locator("#card-backend_deploy");
	await card.getByText("Private Zeninstaller Backend", { exact: true }).click();
	await expect(card.getByText("Sign in to Azure", { exact: true })).toBeVisible();
	await expect(card.getByRole("button", { name: /^(Build|Deploy)$/ })).toHaveCount(0);
	await expectSnapshot(page, card, testInfo, "authentication-required", viewportName);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
	const viewportName = getViewportName(testInfo);
	test.skip(process.env.RUN_BACKEND_DEPLOY_INTEGRATION !== "true",
		"Set RUN_BACKEND_DEPLOY_INTEGRATION=true only after approving live build and deployment.");
	test.setTimeout(1_200_000);
	const { card, appName, readLatestBuild } = await prepareExistingBackend(page, context, viewportName);
	const previousBuild = await readLatestBuild();
	let builtSha = "";
	await expectSnapshot(page, card, testInfo, "start", viewportName);
	await test.step("Build the backend using the existing PROD environment", async () => {
		await card.getByRole("button", { name: "Build", exact: true }).click();
		await expect(card.getByRole("button", { name: "Building...", exact: true })).toBeVisible();
		await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
		await expect(card.getByRole("button", { name: "Build", exact: true })).toBeEnabled({ timeout: 400_000 });
		await expect(card.getByText(/Latest build: none yet/)).toHaveCount(0);
		await expect(card.getByText(/Failed|taking longer than expected|Could not/i)).toHaveCount(0);
		const completedBuild = await readLatestBuild();
		if (!completedBuild) throw new Error("The workflow completed without publishing a backend build report.");
		if (completedBuild.runId === previousBuild?.runId) {
			throw new Error(`The build poll returned the existing workflow run ${completedBuild.runId}; no new build was verified.`);
		}
		if (!completedBuild.artifactId || completedBuild.artifactId <= 0) {
			throw new Error(`Workflow run ${completedBuild.runId} did not publish a package artifact.`);
		}
		if (completedBuild.builtAt <= (previousBuild?.builtAt ?? 0)) {
			throw new Error(`Workflow run ${completedBuild.runId} is not newer than the pre-build report.`);
		}
		builtSha = completedBuild.sha.slice(0, 7);
		await expect(card.getByText(/^Latest build:/)).toContainText(builtSha);
		await expectSnapshot(page, card, testInfo, "built", viewportName);
	});
	await test.step("Deploy the built package to the existing Function App", async () => {
		const deploy = card.getByRole("button", { name: "Deploy", exact: true });
		await expect(deploy, "A passing live integration run must actually deploy; an already-current app is a no-op, not a deploy pass.").toBeEnabled();
		await deploy.click();
		await expect(card.getByText("The Function App is running the latest build.", { exact: true })).toBeVisible();
		await expectSuccessfulSteps(card, backendStepLabels(appName));
		await expect(deploy).toBeDisabled();
		await expectSnapshot(page, card, testInfo, "deployed", viewportName);
	});
	await test.step("Read back the deployed version after reload", async () => {
		await page.reload();
		await openBackendCard(page);
		await expect(card.getByText(/^Live on the app:/)).toContainText(builtSha);
		await expect(card.getByText("The Function App is running the latest build.", { exact: true })).toBeVisible();
		await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
		await expectSnapshot(page, card, testInfo, "persisted", viewportName);
	});
}
