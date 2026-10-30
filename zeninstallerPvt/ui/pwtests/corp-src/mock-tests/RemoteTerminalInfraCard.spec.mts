/// <reference types="node" />
// UI component: ../../../corp-src/cards/RemoteTerminalInfra/RemoteTerminalInfraCard.tsx
import { expect, type BrowserContext, type Page, type Locator } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot, safePathSegment } from "../../util/testHelper.ts";
import { coreInfraStepLabels, expectSuccessfulSteps, installCoreInfraAzureMock, installMockAzure, installMockGitHub, mockSubscriptionId, mockTenantId } from "../util/mockTestHelper.mts";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "../util/setupHelper.mjs";
import { expandAzureAppRegistrationCard, expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard, openRemoteTerminalCard } from "../util/cardHelper.mjs";
import { chooseExistingRepo, getWebStorageAccountName } from "../util/testHelper.mts";
import { AZURE_MANAGEMENT_URL, GITHUB_API_URL, MICROSOFT_GRAPH_URL, SUBSCRIPTION_ID, TEST_REPO_MAIN } from "../../testInit.js";

test.beforeEach(async ({ page }) => {
	await page.coverage.startJSCoverage({ resetOnNavigation: false });
});
test.afterEach(async ({ page }, testInfo) => {
	await attachJSCoverage(page, testInfo);
});

const terminalKeys = [
	"WEBPUBSUB_ENDPOINT",
	"WEBPUBSUB_CLIENT_ID",
	"WEBPUBSUB_TENANT_ID",
	"VITE_API_URL",
	"VITE_AZURE_CLIENT_ID",
	"VITE_APPINSIGHTS_CONNECTION_STRING",
] as const;

test("Happy path provisions the website and both relay identities", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Shows provisioning failure and allows a successful retry", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, corpName, webStorageName, github, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failProvisioningOnce: true });
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByText(/Mock provisioning permission denied/)).toBeVisible();
	await expect(card.getByRole("button", { name: "Create terminal relay", exact: true })).toBeEnabled();
	expect(github.variables.WEBPUBSUB_CLIENT_ID).toBeUndefined();
	expect(github.variables.VITE_API_URL).toBeUndefined();
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(corpName, webStorageName));
	await openConnectionDetails(card);
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
	expect(github.variables.VITE_API_URL).toBe("https://pwtests-terminal-app.azurewebsites.net");
	await expectSnapshot(page, card, testInfo, "recovered", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reports website CORS failure and retries provisioning", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, corpName, webStorageName, github, corsWrites, website, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failCorsOnce: true });
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByText(/Mock blob CORS permission denied/)).toBeVisible();
	await expect(card.getByRole("button", { name: "Create terminal relay", exact: true })).toBeEnabled();
	expect(corsWrites).toHaveLength(0);
	expect(website.staticWebsiteWrite).toBeNull();
	expect(github.variables.VITE_API_URL).toBeUndefined();
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(corpName, webStorageName));
	expect(corsWrites).toHaveLength(1);
	expect(website.staticWebsiteWrite).toContain("<Enabled>true</Enabled>");
	await openConnectionDetails(card);
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
	await expectSnapshot(page, card, testInfo, "cors-recovered", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reports static website hosting failure and retries", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, corpName, webStorageName, github, website, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failStaticWebsiteOnce: true });
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByText(/Mock static website permission denied/)).toBeVisible();
	await expect(card.getByRole("button", { name: "Create terminal relay", exact: true })).toBeEnabled();
	expect(website.staticWebsiteWrite).toBeNull();
	expect(github.variables.VITE_AZURE_CLIENT_ID).toBeUndefined();
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(corpName, webStorageName));
	expect(website.staticWebsiteWrite).toContain("<Enabled>true</Enabled>");
	await openConnectionDetails(card);
	await expectSnapshot(page, card, testInfo, "website-recovered", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Retries a failed installer service-principal creation", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, corpName, webStorageName, graph, github, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failInstallerPrincipalOnce: true });
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByText(/403 \/servicePrincipals:.*Mock installer principal denied/)).toBeVisible();
	await expect(card.getByRole("button", { name: "Create terminal relay", exact: true })).toBeEnabled();
	expect(github.variables.VITE_AZURE_CLIENT_ID).toBeUndefined();
	expect(graph.servicePrincipalWrites).toHaveLength(0);
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(corpName, webStorageName));
	expect(graph.servicePrincipalWrites).toContainEqual({
		appId: "00000000-0000-0000-0000-000000000006", id: "mock-installer-principal",
	});
	await openConnectionDetails(card);
	await expect(connectionInput(card, "VITE_AZURE_CLIENT_ID")).toHaveValue("00000000-0000-0000-0000-000000000006");
	await expectSnapshot(page, card, testInfo, "installer-recovered", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Retries one failed connection-variable write and verifies persistence", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, github, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failVariableWriteOnce: true });
	await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await openConnectionDetails(card);
	await expect(card.getByRole("button", { name: "Save 1 variable", exact: true })).toBeEnabled({ timeout: 60_000 });
	expect(github.variables.VITE_API_URL).toBeUndefined();
	expect(Object.keys(github.variables).filter((key) => terminalKeys.includes(key as typeof terminalKeys[number])))
		.toHaveLength(5);
	await expect(card.getByText("VITE_API_URL", { exact: true }).locator("../..")
		.locator('svg[data-testid="ErrorOutlineIcon"]')).toBeVisible();
	await card.getByRole("button", { name: "Save 1 variable", exact: true }).click();
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
	expect(github.variables.VITE_API_URL).toBe("https://pwtests-terminal-app.azurewebsites.net");
	await expectSnapshot(page, card, testInfo, "variable-recovered", viewportName);
	await page.reload();
	await openRemoteTerminalCard(page);
	await openConnectionDetails(card);
	for (const key of terminalKeys) await expect(connectionInput(card, key)).toHaveValue(github.variables[key]);
	await expectSnapshot(page, card, testInfo, "variable-persisted", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Requires authentication before creating relay resources", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const unexpectedRequests = await installRelayNetworkGuard(context);
	await page.goto(CORP_URL);
	const card = page.locator("#card-remote_terminal_infra");
	await card.getByText("Private Zeninstaller Environment", { exact: true }).click();
	await expect(card.getByText("Sign in to Azure", { exact: true })).toBeVisible();
	await expect(card.getByRole("button", { name: /Create terminal relay|Re-run/ })).toHaveCount(0);
	await expectSnapshot(page, card, testInfo, "authentication-required", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(180_000);
	const { card, corpName, tenantId, webStorageName, siteUrl, github, graph, resources, writes, roles,
		corsWrites, website, unexpectedRequests } = await prepareMockRelay(page, context, viewportName);
	await expectSnapshot(page, card, testInfo, "start", viewportName);
	await test.step("Create the relay and save all six connection variables", async () => {
		await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
		await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
		await expectSuccessfulSteps(card, remoteTerminalStepLabels(corpName, webStorageName));
		await openConnectionDetails(card);

		const expected = {
			WEBPUBSUB_ENDPOINT: `${corpName}-wpubsub.webpubsub.azure.com`,
			WEBPUBSUB_CLIENT_ID: "00000000-0000-0000-0000-000000000005",
			WEBPUBSUB_TENANT_ID: tenantId,
			VITE_API_URL: `https://${corpName}-terminal-app.azurewebsites.net`,
			VITE_AZURE_CLIENT_ID: "00000000-0000-0000-0000-000000000006",
			VITE_APPINSIGHTS_CONNECTION_STRING:
				"InstrumentationKey=mock-insights-key;IngestionEndpoint=https://australiaeast-1.in.applicationinsights.azure.com/",
		};
		for (const key of terminalKeys) {
			await expect(connectionInput(card, key)).toHaveValue(expected[key]);
			expect(github.variables[key]).toBe(expected[key]);
		}
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
		expect(Object.fromEntries(terminalKeys.map((key) => [key, github.variables[key]]))).toEqual(expected);

		expect(resources.size).toBe(10);
		const websiteStoragePath = `/subscriptions/mock-subscription/resourcegroups/root-${corpName}/providers/microsoft.storage/storageaccounts/${webStorageName}`;
		expect(resources.has(websiteStoragePath)).toBe(true);
		expect(corsWrites).toEqual([{
			properties: {
				cors: {
					corsRules: [{
						allowedOrigins: [new URL(CORP_URL).origin],
						allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT"],
						allowedHeaders: ["*"],
						exposedHeaders: ["*"],
						maxAgeInSeconds: 3600,
					}],
				},
			},
		}]);
		expect(website.staticWebsiteWrite).toContain("<Enabled>true</Enabled>");
		expect(website.staticWebsiteWrite).toContain("<IndexDocument>index.html</IndexDocument>");
		expect(website.staticWebsiteWrite).toContain("<ErrorDocument404Path>index.html</ErrorDocument404Path>");

		const installerApp = graph.applications.get("Zeninstaller Private");
		expect(installerApp?.appId).toBe(expected.VITE_AZURE_CLIENT_ID);
		expect(installerApp?.body).toEqual(expect.objectContaining({
			displayName: "Zeninstaller Private",
			signInAudience: "AzureADMyOrg",
			api: { requestedAccessTokenVersion: 2 },
			spa: { redirectUris: [siteUrl] },
		}));
		const delegated = installerApp?.body.requiredResourceAccess as {
			resourceAppId: string; resourceAccess: { type: string }[];
		}[];
		expect(delegated.map(({ resourceAppId }) => resourceAppId)).toEqual(expect.arrayContaining([
			"00000003-0000-0000-c000-000000000000",
			"797f4846-ba00-4fd7-ba43-dac1f8f63013",
			"e406a681-f3d4-42a8-90b6-c2b029497af1",
		]));
		expect(delegated.every(({ resourceAccess }) => resourceAccess.length > 0 &&
			resourceAccess.every(({ type }) => type === "Scope"))).toBe(true);
		expect(graph.servicePrincipalWrites).toEqual(expect.arrayContaining([
			{ appId: expected.VITE_AZURE_CLIENT_ID, id: "mock-installer-principal" },
			{ appId: expected.WEBPUBSUB_CLIENT_ID, id: "mock-pipeline-principal" },
		]));
		const consentScopes = JSON.parse(await page.evaluate(
			() => localStorage.getItem("zeninstaller_mock_storage_consent_scopes") ?? "[]",
		)) as string[];
		expect(consentScopes).toContain("https://storage.azure.com/user_impersonation");

		const roleWrites = writes.filter(({ path }) => path.includes("/providers/microsoft.authorization/roleassignments/"));
		expect(roleWrites).toHaveLength(7);
		const root = `/subscriptions/mock-subscription/resourcegroups/root-${corpName}/providers`;
		for (const [scope, roleId, principalId, principalType] of [
			[`${root}/microsoft.storage/storageaccounts/${webStorageName}`, "ba92f5b4-2d11-453d-a403-e96b0029c9fe", "mock-user", "User"],
			[`${root}/microsoft.storage/storageaccounts/pwteststerm`, "ba92f5b4-2d11-453d-a403-e96b0029c9fe", "mock-function-principal", "ServicePrincipal"],
			[`${root}/microsoft.storage/storageaccounts/pwteststerm`, "974c5e8b-45b9-4653-ba55-5f855dd0fb88", "mock-function-principal", "ServicePrincipal"],
			[`${root}/microsoft.storage/storageaccounts/pwteststerm`, "0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3", "mock-function-principal", "ServicePrincipal"],
			[`${root}/microsoft.signalrservice/webpubsub/${corpName}-wpubsub`, "12cf5a90-567b-43ae-8102-96cf46c7d9b4", "mock-function-principal", "ServicePrincipal"],
			[`${root}/microsoft.insights/components/${corpName}-terminal-ai`, "3913510d-42f4-4e42-8a64-420c390055eb", "mock-function-principal", "ServicePrincipal"],
			[`${root}/microsoft.signalrservice/webpubsub/${corpName}-wpubsub`, "12cf5a90-567b-43ae-8102-96cf46c7d9b4", "mock-pipeline-principal", "ServicePrincipal"],
		]) {
			expect(roleWrites).toEqual(expect.arrayContaining([{
				path: expect.stringMatching(new RegExp(`^${scope}/providers/microsoft\\.authorization/roleassignments/`)),
				body: { properties: {
					principalId, principalType,
					roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
				} },
			}]));
		}
		await expectSnapshot(page, card, testInfo, "created", viewportName);
	});

	await test.step("Reload and verify all six saved values", async () => {
		await page.reload();
		await openRemoteTerminalCard(page);
		await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled();
		await openConnectionDetails(card);
		for (const key of terminalKeys) await expect(connectionInput(card, key)).toHaveValue(github.variables[key]);
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
		await expectSnapshot(page, card, testInfo, "persisted", viewportName);
	});

	await test.step("Re-run without replacing identities or role grants", async () => {
		const applicationWrites = graph.applicationWrites.length;
		const principalWrites = graph.servicePrincipalWrites.length;
		const roleWrites = writes.filter(({ path }) => path.includes("/providers/microsoft.authorization/roleassignments/")).length;
		const resourceCount = resources.size;
		await card.getByRole("button", { name: "Re-run", exact: true }).click();
		await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
		await expectSuccessfulSteps(card, remoteTerminalStepLabels(corpName, webStorageName));
		expect(graph.applicationWrites).toHaveLength(applicationWrites);
		expect(graph.servicePrincipalWrites).toHaveLength(principalWrites);
		expect(writes.filter(({ path }) => path.includes("/providers/microsoft.authorization/roleassignments/"))).toHaveLength(roleWrites);
		expect(resources.size).toBe(resourceCount);
		expect(corsWrites).toHaveLength(2);
		await expectSnapshot(page, card, testInfo, "rerun", viewportName);
	});

	await test.step("Keep an unsaved API URL edit while details are collapsed", async () => {
		const input = connectionInput(card, "VITE_API_URL");
		const original = await input.inputValue();
		await input.fill("https://unsaved.example");
		await expect(card.getByRole("button", { name: "Save 1 variable", exact: true })).toBeEnabled();
		await card.getByText("collapse", { exact: true }).click();
		await expect(input).toBeHidden();
		await openConnectionDetails(card);
		await expect(input).toHaveValue("https://unsaved.example");
		await input.fill(original);
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
		expect(github.variables.VITE_API_URL).toBe(original);
		await expectSnapshot(page, card, testInfo, "draft-restored", viewportName);
	});
	expect(unexpectedRequests, "No unmocked external requests").toEqual([]);
}

export function connectionInput(card: Locator, key: string) {
	const label = key === "VITE_AZURE_CLIENT_ID" ? "Sign-in App Client ID" : key;
	return card.getByText(label, { exact: true }).locator("../..").getByRole("textbox");
}

export async function openConnectionDetails(card: Locator) {
	const toggle = card.getByText("open to enter connection detail", { exact: true });
	if (await toggle.isVisible()) await toggle.click();
	await expect(card.getByText("Connection details", { exact: true })).toBeVisible();
	await expect(card.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
}

function remoteTerminalStepLabels(corpName: string, webStorageAccountName: string) {
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

async function prepareExistingRelayRepository(page: Page, context: BrowserContext, viewportName: string) {
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
	// Never clone or create a repository for relay tests.
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
	const relayCard = page.locator("#card-remote_terminal_infra");
	await relayCard.getByText("Private Zeninstaller Environment", { exact: true }).click();
	const coreRequirement = relayCard.getByText("Set up Corp infrastructure", { exact: true });
	if (await coreRequirement.isVisible()) {
		await coreCard.getByRole("button", { name: /^(?:Create core infrastructure|Re-run)$/ }).click();
		await expect(coreCard.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
		await expectSuccessfulSteps(coreCard, coreInfraStepLabels(corpName));
	}
	await expect(relayCard.getByText(/The relay behind the stage-card terminal:/)).toBeVisible({ timeout: 60_000 });
	return { card: relayCard, corpName, tenantId, repoName };
}

const corpName = "pwtests";
const terminalStorageName = "pwteststerm";
const webStorageName = getWebStorageAccountName(corpName);
const functionAppName = "pwtests-terminal-app";
const pipelineAppName = `${corpName}-terminal-pipeline`;
const installerAppName = "Zeninstaller Private";
const pipelineClientId = "00000000-0000-0000-0000-000000000005";
const installerClientId = "00000000-0000-0000-0000-000000000006";
const pipelineObjectId = "mock-pipeline-app";
const installerObjectId = "mock-installer-app";
const pipelineSpId = "mock-pipeline-principal";
const installerSpId = "mock-installer-principal";
const insightsConnectionString =
	"InstrumentationKey=mock-insights-key;IngestionEndpoint=https://australiaeast-1.in.applicationinsights.azure.com/";
const siteUrl = `https://${webStorageName}.z13.web.core.windows.net`;
const corpOrigin = new URL(CORP_URL).origin;

export type RelayMockOptions = {
	failProvisioningOnce?: boolean;
	failCorsOnce?: boolean;
	failStaticWebsiteOnce?: boolean;
	failInstallerPrincipalOnce?: boolean;
	failVariableWriteOnce?: boolean;
	requireStorageConsent?: boolean;
	omitRepository?: boolean;
};

type GraphApplication = {
	appId: string;
	id: string;
	displayName: string;
	body: Record<string, unknown>;
};

export async function installRelayNetworkGuard(context: BrowserContext) {
	const unexpectedRequests: string[] = [];
	await context.route("**/*", async (route) => {
		if (new URL(route.request().url()).origin === new URL(CORP_URL).origin) return route.continue();
		unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
		await route.abort("blockedbyclient");
	});
	await context.route("https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json", (route) =>
		route.fulfill({ json: { enabled: false } }));
	await context.route("https://australiaeast-1.in.applicationinsights.azure.com/v2/track", (route) =>
		route.fulfill({ json: { itemsReceived: 0, itemsAccepted: 0, errors: [] } }));
	return unexpectedRequests;
}

export async function prepareMockRelay(
	page: Page, context: BrowserContext, viewportName: string, options: RelayMockOptions = {},
) {
	const unexpectedRequests = await installRelayNetworkGuard(context);
	await page.route(/\/corp-src\/auth\/msal\.ts(?:\?.*)?$/, (route) => route.fulfill({
		contentType: "application/javascript",
		body: `
			export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
			export const PINNED_TENANT_ID = "${mockTenantId}";
			export const LOGIN_AUTHORITY = "https://login.microsoftonline.com/${mockTenantId}";
			export const cleanTenantId = tenant => tenant?.trim().toLowerCase();
			const account = { homeAccountId: "mock-home", environment: "login.microsoftonline.com",
				tenantId: "${mockTenantId}", localAccountId: "mock-user", username: "mock-user@example.com",
				name: "Mock Azure User", tenantProfiles: new Map() };
			const reject = async () => { throw new Error("Unexpected authentication redirect in relay mock"); };
			export const getMsal = async () => ({ handleRedirectPromise: async () => null,
				getAllAccounts: () => [account], acquireTokenSilent: async () => ({ account, accessToken: "mock-token" }),
				loginRedirect: reject, acquireTokenRedirect: reject, clearCache: async () => {} });
			export const ensureScopeConsent = async (_account, scopes) => {
				localStorage.setItem("zeninstaller_mock_storage_consent_scopes", JSON.stringify(scopes));
				return localStorage.getItem("zeninstaller_mock_require_storage_consent") === "true";
			};
			export const getToken = async () => "mock-token";
			let active;
			export const setActiveAzureIdentity = value => { active = value; };
			export const getMsToken = async () => active ? "mock-token" : null;
			export const requireMsToken = async () => {
				if (!active) throw new Error("No mocked account selected");
				return "mock-token";
			};
		`,
	}));

	const repoName = `${TEST_REPO_MAIN}-${viewportName}`;
	const azureClientId = "00000000-0000-0000-0000-000000000002";
	await context.addInitScript(({ clientId, tenantId, subscriptionId, company, requireStorageConsent }) => {
		localStorage.setItem("zeninstaller_azure_result", JSON.stringify({
			clientId, tenantId, subscriptionIds: [subscriptionId],
		}));
		localStorage.setItem("zeninstaller_infra_result", JSON.stringify({ corpName: company, subscriptionId }));
		if (requireStorageConsent) localStorage.setItem("zeninstaller_mock_require_storage_consent", "true");
		sessionStorage.setItem("zeninstaller_arm_tenant", tenantId);
	}, {
		clientId: azureClientId, tenantId: mockTenantId, subscriptionId: mockSubscriptionId, company: corpName,
		requireStorageConsent: options.requireStorageConsent ?? false,
	});
	const github = await installMockGitHub(page, context, {
		repositoryName: repoName, branches: ["main", "PROD"],
		initialVariables: {
			NAME: corpName, AZURE_TENANT_ID: mockTenantId, AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
			AZURE_CLIENT_ID: azureClientId, AZURE_PLAN_CLIENT_ID: azureClientId,
		},
	});
	let variableWriteFailed = false;
	await page.route(`${GITHUB_API_URL}/**/environments/PROD/variables`, async (route) => {
		const request = route.request();
		if (options.failVariableWriteOnce && !variableWriteFailed && request.method() === "POST" &&
			(request.postDataJSON() as { name?: string } | null)?.name === "VITE_API_URL") {
			variableWriteFailed = true;
			return route.fulfill({ status: 503, json: { message: "Mock environment-variable write failure" } });
		}
		return route.fallback();
	});

	const azure = await installMockAzure(page, {
		appDisplayName: "zeninstaller-github", servicePrincipalCreated: true, rbacAssigned: true,
	});
	const graph = {
		applicationWrites: [] as GraphApplication[],
		servicePrincipalWrites: [] as { appId: string; id: string }[],
		federatedCredentialWrites: [] as Record<string, unknown>[],
		delegatedScopeLookups: [] as { resourceAppId: string; scopeNames: string[] }[],
		applications: new Map<string, GraphApplication>(),
		servicePrincipals: new Map<string, string>(),
		federatedCredentials: new Map<string, Record<string, unknown>[]>(),
	};
	graph.applications.set("zeninstaller-github", {
		appId: "00000000-0000-0000-0000-000000000002",
		id: "00000000-0000-0000-0000-000000000003",
		displayName: "zeninstaller-github",
		body: {},
	});
	graph.servicePrincipals.set("00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000004");
	const permissionScopes: Record<string, string[]> = {
		"00000003-0000-0000-c000-000000000000": [
			"User.Read", "Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All",
			"Application.Read.All", "Domain.ReadWrite.All",
		],
		"797f4846-ba00-4fd7-ba43-dac1f8f63013": ["user_impersonation"],
		"e406a681-f3d4-42a8-90b6-c2b029497af1": ["user_impersonation"],
	};
	let installerPrincipalFailed = false;
	await page.route(`${MICROSOFT_GRAPH_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const filter = url.searchParams.get("$filter") ?? "";
		if (url.pathname === "/v1.0/applications" && request.method() === "GET" &&
			filter.startsWith("displayName eq '")) {
			const name = filter.slice("displayName eq '".length, -1);
			const app = graph.applications.get(name);
			return route.fulfill({ json: { value: app ? [{ id: app.id, appId: app.appId }] : [] } });
		}
		if (url.pathname === "/v1.0/applications" && request.method() === "POST") {
			const body = request.postDataJSON() as Record<string, unknown> & { displayName: string };
			if (body.displayName === installerAppName || body.displayName === pipelineAppName) {
				const installer = body.displayName === installerAppName;
				const app = {
					appId: installer ? installerClientId : pipelineClientId,
					id: installer ? installerObjectId : pipelineObjectId,
					displayName: body.displayName,
					body,
				};
				graph.applicationWrites.push(app);
				graph.applications.set(app.displayName, app);
				return route.fulfill({ status: 201, json: { id: app.id, appId: app.appId } });
			}
		}
		if (url.pathname === "/v1.0/servicePrincipals" && request.method() === "GET" &&
			filter.startsWith("appId eq '")) {
			const appId = filter.slice("appId eq '".length, -1);
			if (permissionScopes[appId]) {
				const names = permissionScopes[appId];
				graph.delegatedScopeLookups.push({ resourceAppId: appId, scopeNames: names });
				return route.fulfill({ json: { value: [{
					oauth2PermissionScopes: names.map((value, index) => ({ value, id: `mock-scope-${index}` })),
				}] } });
			}
			const principalId = graph.servicePrincipals.get(appId);
			return route.fulfill({ json: { value: principalId ? [{ id: principalId }] : [] } });
		}
		if (url.pathname === "/v1.0/servicePrincipals" && request.method() === "POST") {
			const { appId } = request.postDataJSON() as { appId: string };
			const installer = appId === installerClientId;
			if (installer && options.failInstallerPrincipalOnce && !installerPrincipalFailed) {
				installerPrincipalFailed = true;
				return route.fulfill({ status: 403, json: { error: { message: "Mock installer principal denied" } } });
			}
			const id = installer ? installerSpId : pipelineSpId;
			graph.servicePrincipalWrites.push({ appId, id });
			graph.servicePrincipals.set(appId, id);
			return route.fulfill({ status: 201, json: { id } });
		}
		const credentialsMatch = url.pathname.match(/^\/v1\.0\/applications\/([^/]+)\/federatedIdentityCredentials$/);
		if (credentialsMatch && request.method() === "GET") {
			return route.fulfill({ json: { value: graph.federatedCredentials.get(credentialsMatch[1]) ?? [] } });
		}
		if (credentialsMatch && request.method() === "POST") {
			const body = request.postDataJSON() as Record<string, unknown>;
			const entries = graph.federatedCredentials.get(credentialsMatch[1]) ?? [];
			entries.push(body);
			graph.federatedCredentials.set(credentialsMatch[1], entries);
			graph.federatedCredentialWrites.push(body);
			return route.fulfill({ status: 201, json: body });
		}
		return route.fallback();
	});

	const core = await installCoreInfraAzureMock(page);
	core.createdResources.add("resource-group");
	core.roleAssignments.set(`/subscriptions/${mockSubscriptionId}/resourcegroups/zbcore-pwtests-rg`,
		new Set(["acdd72a7-3385-48ef-bd42-f606fba81ae7"]));
	const resources = new Map<string, Record<string, unknown>>();
	const writes: { path: string; body: Record<string, unknown> }[] = [];
	const roles = new Map<string, { properties: { principalId: string; roleDefinitionId: string; principalType: string } }[]>();
	const corsWrites: Record<string, unknown>[] = [];
	const website = { staticWebsiteWrite: null as string | null };
	let provisioningFailed = false;
	let corsFailed = false;
	let staticWebsiteFailed = false;
	const resourcePaths = [
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.operationalinsights/workspaces/${corpName}-terminal-law`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.insights/components/${corpName}-terminal-ai`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.storage/storageaccounts/${terminalStorageName}`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.storage/storageaccounts/${terminalStorageName}/tableservices/default/tables/sessions`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.storage/storageaccounts/${terminalStorageName}/blobservices/default/containers/deployment`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.storage/storageaccounts/${webStorageName}`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.signalrservice/webpubsub/${corpName}-wpubsub`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.signalrservice/webpubsub/${corpName}-wpubsub/hubs/terminal`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.web/serverfarms/${functionAppName}-plan`,
		`/subscriptions/${mockSubscriptionId}/resourcegroups/root-${corpName}/providers/microsoft.web/sites/${functionAppName}`,
	];
	await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname.toLowerCase();
		const method = request.method();
		if (path === `/subscriptions/${mockSubscriptionId}/providers/microsoft.storage/storageaccounts` && method === "GET") {
			return route.fulfill({ json: { value: [{
				name: webStorageName,
				id: `/subscriptions/${mockSubscriptionId}/resourceGroups/root-${corpName}/providers/Microsoft.Storage/storageAccounts/${webStorageName}`,
				properties: { primaryEndpoints: { web: siteUrl } },
			}] } });
		}
		if (path.endsWith(`/sites/${functionAppName}/config/appsettings/list`) && method === "POST") {
			return route.fulfill({ json: { properties: {
				ALLOWED_ORIGINS: corpOrigin,
				WEBPUBSUB_ENDPOINT: `${corpName}-wpubsub.webpubsub.azure.com`,
				HUB_NAME: "terminal",
				SESSION_TABLE_ACCOUNT_NAME: terminalStorageName,
				SESSION_TABLE_NAME: "sessions",
			} } });
		}
		if (path.endsWith(`/storageaccounts/${webStorageName}/blobservices/default`) && method === "PUT") {
			if (options.failCorsOnce && !corsFailed) {
				corsFailed = true;
				return route.fulfill({ status: 403, body: "Mock blob CORS permission denied" });
			}
			const body = request.postDataJSON() as Record<string, unknown>;
			corsWrites.push(body);
			writes.push({ path, body });
			return route.fulfill({ json: { properties: body.properties } });
		}
		const roleMarker = "/providers/microsoft.authorization/roleassignments";
		const roleIndex = path.indexOf(roleMarker);
		if (roleIndex >= 0 && !path.slice(0, roleIndex).endsWith(`/resourcegroups/root-${corpName}`) &&
			!path.slice(0, roleIndex).endsWith(`/subscriptions/${mockSubscriptionId}`)) {
			const scope = path.slice(0, roleIndex);
			if (method === "GET") {
				const filter = url.searchParams.get("$filter") ?? "";
				const principalId = /^assignedTo\('([^']+)'\)$/.exec(filter)?.[1];
				if (!principalId) throw new Error(`Unexpected role-assignment filter: ${filter}`);
				return route.fulfill({ json: { value: (roles.get(scope) ?? []).filter(
					(assignment) => assignment.properties.principalId === principalId,
				) } });
			}
			if (method === "PUT") {
				const body = request.postDataJSON() as { properties: { principalId: string; roleDefinitionId: string; principalType: string } };
				roles.set(scope, [...(roles.get(scope) ?? []), body]);
				writes.push({ path, body });
				return route.fulfill({ json: body });
			}
		}
		if (!resourcePaths.includes(path)) return route.fallback();
		if (method === "GET") {
			return resources.has(path)
				? route.fulfill({ json: resources.get(path) })
				: route.fulfill({ status: 404, json: { error: { code: "ResourceNotFound" } } });
		}
		if (method === "PUT") {
			if (options.failProvisioningOnce && !provisioningFailed &&
				path.endsWith(`/components/${corpName}-terminal-ai`)) {
				provisioningFailed = true;
				return route.fulfill({ status: 403, json: {
					error: { code: "AuthorizationFailed", message: "Mock provisioning permission denied" },
				} });
			}
			const body = request.postDataJSON() as Record<string, unknown>;
			writes.push({ path, body });
			const properties = {
				...((body.properties as Record<string, unknown> | undefined) ?? {}),
				provisioningState: "Succeeded",
				...(path.endsWith(`/components/${corpName}-terminal-ai`) ? { ConnectionString: insightsConnectionString } : {}),
			};
			const resource: Record<string, unknown> = {
				...body, id: path, properties,
				...(path.endsWith(`/sites/${functionAppName}`)
					? { identity: { type: "SystemAssigned", principalId: "mock-function-principal" } }
					: {}),
			};
			resources.set(path, resource);
			return route.fulfill({ json: resource });
		}
		return route.fallback();
	});
	await page.route(`https://${webStorageName}.blob.core.windows.net/**`, async (route) => {
		const request = route.request();
		const headers = {
			"Access-Control-Allow-Origin": corpOrigin,
			"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS, PUT",
			"Access-Control-Allow-Headers": "*",
		};
		if (request.method() === "OPTIONS") return route.fulfill({ status: 200, headers });
		if (request.method() !== "PUT" || !new URL(request.url()).searchParams.has("restype")) {
			unexpectedRequests.push(`${request.method()} ${request.url()}`);
			return route.abort("blockedbyclient");
		}
		if (options.failStaticWebsiteOnce && !staticWebsiteFailed) {
			staticWebsiteFailed = true;
			return route.fulfill({ status: 403, headers, body: "Mock static website permission denied" });
		}
		website.staticWebsiteWrite = await request.postData() ?? "";
		return route.fulfill({ status: 202, headers });
	});

	const url = new URL(CORP_URL);
	url.search = new URLSearchParams({
		account: "mock-user",
		repo: options.omitRepository ? "" : repoName,
		env: "PROD",
		tenant: mockTenantId,
		subscription: mockSubscriptionId,
	}).toString();
	await page.goto(url.toString());
	const card = await openRemoteTerminalCard(page);
	return {
		card, corpName, tenantId: mockTenantId, repoName, webStorageName, siteUrl,
		github, azure, graph, resources, writes, roles, corsWrites, website, unexpectedRequests,
	};
}
