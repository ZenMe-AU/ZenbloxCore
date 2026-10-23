/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/CreateDomain/CreateDomainCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL, SUBSCRIPTION_ID, TEST_REPO_MAIN } from "../../testInit";
import { attachJSCoverage, expectSnapshot, expectVisibleWithin, safePathSegment } from "../../util/testHelper.ts";
import {
	expandAzureAppRegistrationCard,
	expandAzureLoginCard,
	expandAzureSubscriptionCard,
	expandRepoCard,
} from "../util/cardHelper.mts";
import { checkRepoExists, chooseExistingRepo, createNewRepo } from "../util/testHelper.mts";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "../util/setupHelper.mts";
import { coreInfraStepLabels, expectSuccessfulSteps } from "../util/mockTestHelper.mts";

const liveDnsDomain = process.env.PWTESTS_CREATE_DOMAIN?.trim().toLowerCase() ?? "";
const domainSetupStepLabels = [
	"Confirm Microsoft permissions",
	"Register required Azure resource providers",
	`Create DNS zone ${liveDnsDomain}`,
	"Add custom domain to Entra ID",
	"Create domain-verification TXT record",
	"Set as primary domain",
	"Grant domain permission to the pipeline",
];
const domainRerunStepLabels = [
	"Confirm Microsoft permissions",
	"Register required Azure resource providers",
	"Add custom domain to Entra ID",
	"Create domain-verification TXT record",
	"Set as primary domain",
	"Grant domain permission to the pipeline",
];

test.beforeEach(async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
  await attachJSCoverage(page, testInfo);
});

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
	const viewportName = getViewportName(testInfo);
	test.skip(
		process.env.RUN_CREATE_DOMAIN_LIVE_PROVISIONING !== "true",
		"Set RUN_CREATE_DOMAIN_LIVE_PROVISIONING=true only for an approved, disposable DNS domain and Azure tenant."
	);
	test.skip(
		!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(liveDnsDomain),
		"Set PWTESTS_CREATE_DOMAIN to the unique lowercase DNS domain for this disposable live run; no fixed production-domain fallback is used."
	);
	test.setTimeout(1_200_000);

		await test.step("Prepare the selected Azure subscription", async () => {
			await prepareExistingAzureSubscription(page, context, viewportName);
		});

		await test.step("Ensure the Terraform state backend is configured", async () => {
			const terraformCard = page.locator("#card-core_infra");
			await expectVisibleWithin(terraformCard.getByText("Company short code"), "Company short code field", 50_000);
			await expect(terraformCard.getByRole("progressbar")).toBeHidden({ timeout: 60_000 });
			const companyInput = terraformCard
				.getByText("COMPANY_SHORT_CODE", { exact: true })
				.locator("../..")
				.getByRole("textbox");
			await expectVisibleWithin(companyInput, "Company short code input", 50_000);
			if (!(await companyInput.inputValue()).trim()) {
				await companyInput.fill("pwtests");
			}
			const companyShortCode = (await companyInput.inputValue()).trim();
			const saveButton = terraformCard.getByRole("button", { name: /^Save\s+(?:\d+\s+)?variables?$/ });
			await expect(saveButton).toBeVisible();
			if (await saveButton.isEnabled()) {
				await saveButton.click();
			}
			await expect(terraformCard.getByRole("button", { name: /^Save\s+variables?$/ })).toBeDisabled({ timeout: 60_000 });

			// Re-run even a completed backend: its cached status does not check the state container.
			const setupButton = terraformCard.getByRole("button", { name: /^(?:Create core infrastructure|Re-run setup)$/ });
			await expectVisibleWithin(setupButton, "Terraform backend setup button", 50_000);
			await expect(setupButton).toBeEnabled({ timeout: 60_000 });
			await setupButton.click();
			await expectVisibleWithin(terraformCard.getByRole("button", { name: "Start over" }), "Terraform backend setup completion", 500_000);
			await expectSuccessfulSteps(terraformCard, coreInfraStepLabels(companyShortCode));
			await expect(terraformCard.getByText(/Failed|Consent redirect failed|Additional consent required/i)).toHaveCount(0);
			await expect(terraformCard.locator('svg[data-testid="ErrorOutlineIcon"]')).toHaveCount(0);
		});

		const card = page.locator("#card-create_domain");
		await test.step("Open the Corp domain card", async () => {
			const description = card.getByText(/Creates the DNS zone for/i);
			if (!(await description.isVisible().catch(() => false))) {
				await card.getByText("Core domain", { exact: true }).first().click();
			}
			await expectVisibleWithin(card.getByText(/Creates the DNS zone for/i), "Domain setup description", 50_000);
		});

		await test.step("Save variables then set up the isolated domain", async () => {
			const domainInput = card.getByText("DNS Domain").locator("../..").getByRole("textbox");
			await expectVisibleWithin(domainInput, "Corp domain input", 50_000);
			await expect(card.getByRole("progressbar")).toBeHidden({ timeout: 60_000 });
			const rerunButton = card.getByRole("button", { name: "Re-run setup" });

			if ((await domainInput.inputValue()).trim() !== liveDnsDomain) {
				const verifiedDomainsHeading = card.getByText("Verified domains in this tenant", { exact: true });
				await expect(verifiedDomainsHeading).toBeVisible();
				await expectSnapshot(page, card, testInfo, "start", viewportName, {
					mask: [verifiedDomainsHeading.locator("..")],
				});
				await domainInput.fill(liveDnsDomain);
				const saveButton = card.getByRole("button", { name: "Save 1 variable" });
				await saveButton.click();
				await expect(card.getByRole("button", { name: "Save variable" })).toBeDisabled({ timeout: 60_000 });
			} else {
				await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
			}

			await expect(domainInput).toHaveValue(liveDnsDomain);
			const setupButton = card.getByRole("button", { name: "Set up core DNS domain" });
			await expect(rerunButton).toBeHidden();
			await expectVisibleWithin(setupButton, "New domain setup button", 60_000);
			await setupButton.click();
			await expectVisibleWithin(card.getByRole("button", { name: "Start over" }), "Domain setup completion", 500_000);
			await expectSuccessfulSteps(card, domainSetupStepLabels);
			await expect(card.getByText(/Failed|Consent redirect failed|Additional consent required/i)).toHaveCount(0);
			await expect(card.getByRole("button", { name: "Verify domain now" })).toBeEnabled();
			await expectSnapshot(page, card, testInfo, "new-setup", viewportName);
		});


		await test.step("Reuse the existing Corp domain", async () => {
			await page.reload();
			if (!(await card.getByText(/Creates the DNS zone for/i).isVisible())) {
				await card.getByText("Core domain", { exact: true }).first().click();
			}

			await expect(card.getByRole("button", { name: "Save variables" })).toBeDisabled();
			await expect(card.getByRole("button", { name: "Verify domain now" })).toBeEnabled();
			const setupButton = card.getByRole("button", { name: "Re-run setup" });
			await expectVisibleWithin(setupButton, "Corp domain setup button", 50_000);
			await setupButton.click();
			await expectVisibleWithin(card.getByRole("button", { name: "Start over" }), "Domain re-run completion", 500_000);
			await expectSuccessfulSteps(card, domainRerunStepLabels);
			await expect(card.getByText(/Failed|Consent redirect failed|Additional consent required/i)).toHaveCount(0);
			await expectVisibleWithin(card.getByRole("button", { name: "Start over" }), "Start over button", 50_000);
			await expectSnapshot(page, card, testInfo, "existing-setup", viewportName);
			await page.reload();
			if (!(await card.getByText(/Creates the DNS zone for/i).isVisible())) {
				await card.getByText("Core domain", { exact: true }).first().click();
			}
		});

		await test.step("Verify the domain card completion state", async () => {
			await expectVisibleWithin(card.getByText("Resources", { exact: true }), "Domain resources section", 50_000);
			await expectVisibleWithin(card.getByText(`DNS zone: ${liveDnsDomain}`, { exact: true }), "Persisted DNS zone name", 50_000);
			await expect(card.getByRole("button", { name: "Verify domain now" })).toBeEnabled();
			await expect(card.getByText(/verified and set as the primary domain/i)).toHaveCount(0);
			await expectSnapshot(page, card, testInfo, "end", viewportName);
		});
}

async function prepareExistingAzureSubscription(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  viewportName: string
) {
  await restoreGithubSessionStorage(context);
  await restoreAzureSessionStorage(context);
  await page.goto(CORP_URL);

  const azureCard = await expandAzureLoginCard(page);
  const tenantSelect = azureCard.getByTestId("tenant-select");
  await expectVisibleWithin(tenantSelect, "Azure tenant selector", 50_000);
  const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
  expect(tenantId, "The restored Azure tenant ID should not be empty").not.toBe("");
  await tenantSelect.click();
  await page.getByRole("option").filter({ hasText: tenantId }).click();

	const repoCard = await expandRepoCard(page);
	const repoName = safePathSegment(`${TEST_REPO_MAIN}-${viewportName}`);
	if (!(await checkRepoExists(page, repoCard, repoName))) {
		await createNewRepo(page, repoCard, repoName);
	}
	await chooseExistingRepo(page, repoCard, repoName);

	await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
	await repoCard.getByText("PROD", { exact: true }).click();
	const createBranchButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
	const subscriptionCard = await expandAzureSubscriptionCard(page);
	const selectEnvironmentMessage = subscriptionCard.getByText(
		"Select a repository & environment to save the tenant and subscription to GitHub.",
		{ exact: true },
	);
	await expect.poll(async () => await createBranchButton.isVisible() || await selectEnvironmentMessage.count() === 0, {
		timeout: 30_000,
		message: "PROD branch state did not finish loading",
	}).toBeTruthy();
	if (await createBranchButton.isVisible()) {
		await expect(createBranchButton).toBeEnabled();
		await createBranchButton.click();
		await expect(createBranchButton).toBeHidden({ timeout: 30_000 });
		await expect(repoCard.getByText("Failed to create branch", { exact: true })).toHaveCount(0);
	}

	await expect(selectEnvironmentMessage).toHaveCount(0);
	await expect(subscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden({ timeout: 60_000 });
	await expectVisibleWithin(subscriptionCard.getByRole("combobox"), "Azure subscription selector", 50_000);
	const subscriptionSelect = subscriptionCard.getByRole("combobox");
	await subscriptionSelect.click();
	const subscriptionOption = page.getByRole("option").filter({ hasText: SUBSCRIPTION_ID });
	await expectVisibleWithin(subscriptionOption, `Subscription ${SUBSCRIPTION_ID} option`, 50_000);
	await subscriptionOption.click();

	await expect(subscriptionCard.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
	const pendingSave = subscriptionCard.getByRole("button", { name: "Save 3 variables", exact: true });
	const cleanSave = subscriptionCard.getByRole("button", { name: /^Save\s+variables$/ });
	await expectVisibleWithin(pendingSave, "Save all three Azure target variables", 60_000);
	await expect(pendingSave).toBeEnabled();
	await pendingSave.click();
	await expect(cleanSave).toBeDisabled({ timeout: 60_000 });

	//TODO: check what happens if registration name left blank (catch error)
	const appRegistrationCard = await expandAzureAppRegistrationCard(page);
	const coreInfraCard = page.locator("#card-core_infra");
	await coreInfraCard.getByText("Terraform state backend", { exact: true }).click();
	const appRegistrationRequirement = coreInfraCard.getByText("Complete the Azure app registration", { exact: true });
	const connectionInputs = appRegistrationCard.locator('[data-sensitive="true"] input');
	await expect(connectionInputs).toHaveCount(2, { timeout: 50_000 });
	await expect.poll(async () =>
		!(await appRegistrationRequirement.isVisible()) ||
		await appRegistrationCard.getByText(/\d+ not configured|doesn't exist in the selected tenant|Missing on the selected subscription|doesn't match AZURE_CLIENT_ID/i).count() > 0,
	{ timeout: 60_000 }).toBe(true);
	if (await appRegistrationRequirement.isVisible()) {
		const appNameInput = appRegistrationCard.locator("input:visible").first();
		await expectVisibleWithin(appNameInput, "App registration name input", 50_000);
		await appNameInput.fill(safePathSegment(`zeninstaller-${repoName}-${Date.now().toString(36)}`));
		await appRegistrationCard.getByRole("button", { name: /^(?:Create app registration|Grant Reader access on this subscription)$/ }).click();
		await expectVisibleWithin(appRegistrationCard.getByRole("button", { name: "Try again" }), "App registration completion", 300_000);
		await expectVisibleWithin(
			appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i),
			"Saved app registration connection details",
			60_000,
		);
	}
	await expect(appRegistrationRequirement).toBeHidden({ timeout: 60_000 });
}
