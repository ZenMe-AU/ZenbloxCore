/// <reference types="node" />
// UI component: ../../../corp-src/cards/RemoteTerminalInfra/RemoteTerminalInfraCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { getViewportName, test } from "../util/viewportFixture.mts";
import { CORP_URL } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import { expectSuccessfulSteps } from "../util/mockTestHelper.mts";
import {
	backendResourceGroup, connectionInput, openConnectionDetails, openRemoteTerminalCard,
	pipelineAppName, remoteTerminalStepLabels, terminalKeys,
} from "../util/RemoteTerminalInfraCardHelper.mts";
import {
	insightsConnectionString, installRelayNetworkGuard, pipelineClientId, prepareMockRelay,
} from "../util/RemoteTerminalInfraCardMockHelper.mts";

test.beforeEach(async ({ page }) => {
	await page.coverage.startJSCoverage({ resetOnNavigation: false });
});
test.afterEach(async ({ page }, testInfo) => {
	await attachJSCoverage(page, testInfo);
});

test("Happy path provisions only the backend and its pipeline identity", async ({ page, context }, testInfo) => {
	await runHappyPath({ page, context }, testInfo);
});

test("Shows provisioning failure and allows a successful retry", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, names, github, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failProvisioningOnce: true });
	const create = card.getByRole("button", { name: "Create backend environment", exact: true });
	await create.click();
	await expect(card.getByText(/Mock provisioning permission denied/)).toBeVisible();
	await expect(create).toBeEnabled();
	expect(github.variables.WEBPUBSUB_CLIENT_ID).toBeUndefined();
	expect(github.variables.VITE_API_URL).toBeUndefined();
	await create.click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(names));
	await openConnectionDetails(card);
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
	expect(github.variables.VITE_API_URL).toBe(`https://${names.functionApp}.azurewebsites.net`);
	expect(github.variables.API_STORAGE_ACCOUNT).toBe(names.storage);
	await expectSnapshot(page, card, testInfo, "recovered", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Retries a failed backend pipeline service-principal creation", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, names, graph, github, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failPipelinePrincipalOnce: true });
	const create = card.getByRole("button", { name: "Create backend environment", exact: true });
	await create.click();
	await expect(card.getByText(/403 \/servicePrincipals:.*Mock pipeline principal denied/)).toBeVisible();
	await expect(create).toBeEnabled();
	expect(github.variables.WEBPUBSUB_CLIENT_ID).toBeUndefined();
	expect(graph.servicePrincipalWrites).toHaveLength(0);
	await create.click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(names));
	expect(graph.applicationWrites).toHaveLength(1);
	expect(graph.servicePrincipalWrites).toEqual([{ appId: pipelineClientId, id: "mock-pipeline-principal" }]);
	await openConnectionDetails(card);
	await expect(connectionInput(card, "WEBPUBSUB_CLIENT_ID")).toHaveValue(pipelineClientId);
	await expectSnapshot(page, card, testInfo, "pipeline-recovered", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Retries one failed connection-variable write and verifies persistence", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, names, github, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { failVariableWriteOnce: true });
	await card.getByRole("button", { name: "Create backend environment", exact: true }).click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await openConnectionDetails(card);
	await expect(card.getByRole("button", { name: "Save 1 variable", exact: true })).toBeEnabled({ timeout: 60_000 });
	expect(github.variables.VITE_API_URL).toBeUndefined();
	await expect(card.getByRole("alert", { name: "Save failed", exact: true })).toBeVisible();
	expect(Object.keys(github.variables).filter((key) => [...terminalKeys, "API_STORAGE_ACCOUNT"].includes(key)))
		.toHaveLength(5);
	expect(github.variables.API_STORAGE_ACCOUNT).toBe(names.storage);
	await expect(card.getByRole("textbox", { name: "Backend Storage Account", exact: true })).toHaveCount(0);
	await card.getByRole("button", { name: "Save 1 variable", exact: true }).click();
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
	expect(github.variables.VITE_API_URL).toBe(`https://${names.functionApp}.azurewebsites.net`);
	await page.reload();
	await openRemoteTerminalCard(page);
	await openConnectionDetails(card);
	for (const key of terminalKeys) await expect(connectionInput(card, key)).toHaveValue(github.variables[key]);
	expect(github.variables.API_STORAGE_ACCOUNT).toBe(names.storage);
	await expectSnapshot(page, card, testInfo, "variable-persisted", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Validates editable resource names and uses the chosen Azure region", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, names, availabilityChecks, writes, paths, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, { nameTakenOnce: true });
	const create = card.getByRole("button", { name: "Create backend environment", exact: true });
	await card.getByRole("button", { name: "Edit Storage account", exact: true }).click();
	await expect(create).toBeDisabled();
	const storage = card.getByRole("textbox", { name: "Storage account", exact: true });
	await storage.fill("INVALID");
	await expect(card.getByText("Lowercase letters and digits only", { exact: true })).toBeVisible();
	await storage.fill("ab");
	await card.getByRole("button", { name: "Confirm Storage account", exact: true }).click();
	await expect(card.getByText("3-24 characters, lowercase letters and digits only", { exact: true })).toBeVisible();
	expect(availabilityChecks).toHaveLength(0);
	await storage.fill(names.storage);
	await card.getByRole("button", { name: "Confirm Storage account", exact: true }).click();
	await expect(card.getByText("This name is taken somewhere in Azure — choose a different one", { exact: true })).toBeVisible();
	await expect(create).toBeDisabled();
	await card.getByRole("button", { name: "Confirm Storage account", exact: true }).click();
	await expect(card.getByRole("button", { name: "Edit Storage account", exact: true })).toBeVisible();
	for (const [label, name] of [["Web PubSub", names.webPubSub], ["Function App", names.functionApp]]) {
		await card.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
		await expect(create).toBeDisabled();
		await expect(card.getByRole("textbox", { name: label, exact: true })).toHaveValue(name);
		await card.getByRole("button", { name: `Confirm ${label}`, exact: true }).click();
		await expect(card.getByRole("button", { name: `Edit ${label}`, exact: true })).toBeVisible();
	}
	expect(availabilityChecks.map(({ body }) => body)).toEqual([
		{ name: names.storage, type: "Microsoft.Storage/storageAccounts" },
		{ name: names.storage, type: "Microsoft.Storage/storageAccounts" },
		{ name: names.webPubSub, type: "Microsoft.SignalRService/WebPubSub" },
		{ name: names.functionApp, type: "Microsoft.Web/sites" },
	]);
	expect(availabilityChecks[2].path).toContain("/locations/australiaeast/checknameavailability");
	await card.getByRole("button", { name: "Edit Azure region", exact: true }).click();
	await card.getByRole("combobox", { name: "Location", exact: true }).click();
	await page.getByRole("option", { name: /Australia Southeast/ }).click();
	await card.getByRole("button", { name: "Confirm Azure region", exact: true }).click();
	await expect(create).toBeEnabled();
	await create.click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(names));
	for (const path of Object.values(paths)) {
		expect(writes.find((write) => write.path === path)?.body.location).toBe("australiasoutheast");
	}
	await expectSnapshot(page, card, testInfo, "names-confirmed", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Reuses saved custom names in their actual groups and scopes OIDC to TEST", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const { card, names, repoName, github, graph, paths, writes, resources, roles, listRequests, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName, {
			environment: "TEST",
			savedNames: { storage: "customrelaystorage", webPubSub: "custom-relay-pubsub", functionApp: "custom-relay-app" },
			existingGroups: { storage: "existing-storage-rg", webPubSub: "existing-pubsub-rg", functionApp: "existing-app-rg" },
		});
	await expect(card.getByText(`Resource group: ${backendResourceGroup}`, { exact: true })).toBeVisible();
	await expect(card.getByText(names.storage, { exact: true })).toBeVisible();
	await expect(card.getByText(names.webPubSub, { exact: true })).toBeVisible();
	await expect(card.getByText(names.functionApp, { exact: true })).toBeVisible();
	await card.getByRole("button", { name: "Create backend environment", exact: true }).click();
	await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
	await expectSuccessfulSteps(card, remoteTerminalStepLabels(names, "TEST"));
	expect(graph.federatedCredentialWrites).toEqual([expect.objectContaining({
		subject: `repo:mock-user@12345/${repoName}@987654321:environment:TEST`,
	})]);
	for (const path of [paths.storage, paths.webPubSub, paths.functionApp]) {
		expect(resources.has(path)).toBe(true);
		expect(writes.some((write) => write.path === path)).toBe(false);
	}
	expect(resources.has(`${paths.storage}/tableservices/default/tables/sessions`)).toBe(true);
	expect(resources.has(`${paths.storage}/blobservices/default/containers/deployment`)).toBe(true);
	expect(resources.has(`${paths.webPubSub}/hubs/terminal`)).toBe(true);
	expect(writes.some((write) => write.path === paths.plan)).toBe(true);
	expect(roles.get(paths.storage)).toHaveLength(3);
	expect(roles.get(paths.webPubSub)).toHaveLength(2);
	expect(listRequests).toEqual(expect.arrayContaining([
		"/subscriptions/mock-subscription/providers/microsoft.storage/storageaccounts",
		"/subscriptions/mock-subscription/providers/microsoft.signalrservice/webpubsub",
		"/subscriptions/mock-subscription/providers/microsoft.web/sites",
	]));
	await openConnectionDetails(card);
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
	expect(github.variables.API_STORAGE_ACCOUNT).toBe(names.storage);
	await page.reload();
	await openRemoteTerminalCard(page);
	await expect(card.getByText(names.storage, { exact: true })).toBeVisible();
	await expect(card.getByText(names.webPubSub, { exact: true })).toBeVisible();
	await expect(card.getByText(names.functionApp, { exact: true })).toBeVisible();
	await expectSnapshot(page, card, testInfo, "custom-names-persisted", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

test("Requires authentication before creating backend resources", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	const unexpectedRequests = await installRelayNetworkGuard(context);
	await page.goto(CORP_URL);
	const card = page.locator("#card-remote_terminal_infra");
	await card.getByRole("button", { name: /^Private Zeninstaller Backend Environment/ }).click();
	await expect(card.getByText("Sign in to Azure", { exact: true })).toBeVisible();
	await expect(card.getByRole("button", { name: /Create backend environment|Re-run/ })).toHaveCount(0);
	await expectSnapshot(page, card, testInfo, "authentication-required", viewportName);
	expect(unexpectedRequests).toEqual([]);
});

async function runHappyPath({ page, context }: { page: Page; context: BrowserContext }, testInfo: TestInfo): Promise<void> {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(180_000);
	const { card, names, tenantId, repoName, github, graph, resources, writes, paths, unexpectedRequests } =
		await prepareMockRelay(page, context, viewportName);
	await expectSnapshot(page, card, testInfo, "start", viewportName);
	await test.step("Create the backend and save five visible values plus hidden storage", async () => {
		await card.getByRole("button", { name: "Create backend environment", exact: true }).click();
		await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
		await expectSuccessfulSteps(card, remoteTerminalStepLabels(names));
		await openConnectionDetails(card);
		const expected = {
			WEBPUBSUB_ENDPOINT: `${names.webPubSub}.webpubsub.azure.com`,
			WEBPUBSUB_CLIENT_ID: pipelineClientId,
			WEBPUBSUB_TENANT_ID: tenantId,
			VITE_API_URL: `https://${names.functionApp}.azurewebsites.net`,
			VITE_APPINSIGHTS_CONNECTION_STRING: insightsConnectionString,
		};
		for (const key of terminalKeys) {
			await expect(connectionInput(card, key)).toHaveValue(expected[key]);
		}
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
		expect(Object.fromEntries(terminalKeys.map((key) => [key, github.variables[key]]))).toEqual(expected);
		expect(github.variables.API_STORAGE_ACCOUNT).toBe(names.storage);
		await expect(card.getByRole("textbox", { name: "Backend Storage Account", exact: true })).toHaveCount(0);
		await expect(card.getByRole("textbox", { name: "API_STORAGE_ACCOUNT", exact: true })).toHaveCount(0);
		await expect(card.getByRole("textbox", { name: "Sign-in App Client ID", exact: true })).toHaveCount(0);
		expect(github.variables.VITE_AZURE_CLIENT_ID).toBeUndefined();
		expect(github.variables.SITE_STORAGE_ACCOUNT).toBeUndefined();
		expect(resources.size).toBe(10);
		expect(resources.has(paths.resourceGroup)).toBe(true);
		expect(graph.applicationWrites.map(({ displayName }) => displayName)).toEqual([pipelineAppName]);
		expect(graph.servicePrincipalWrites).toEqual([{ appId: pipelineClientId, id: "mock-pipeline-principal" }]);
		expect(graph.federatedCredentialWrites).toEqual([expect.objectContaining({
			issuer: "https://token.actions.githubusercontent.com",
			subject: `repo:mock-user@12345/${repoName}@987654321:environment:PROD`,
			audiences: ["api://AzureADTokenExchange"],
		})]);
		expect(await page.evaluate(() => localStorage.getItem("zeninstaller_mock_storage_consent_requested"))).toBeNull();
		const roleWrites = writes.filter(({ path }) => path.includes("/providers/microsoft.authorization/roleassignments/"));
		expect(roleWrites).toHaveLength(6);
		for (const [scope, roleId, principalId] of [
			[paths.storage, "ba92f5b4-2d11-453d-a403-e96b0029c9fe", "mock-function-principal"],
			[paths.storage, "974c5e8b-45b9-4653-ba55-5f855dd0fb88", "mock-function-principal"],
			[paths.storage, "0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3", "mock-function-principal"],
			[paths.webPubSub, "12cf5a90-567b-43ae-8102-96cf46c7d9b4", "mock-function-principal"],
			[paths.insights, "3913510d-42f4-4e42-8a64-420c390055eb", "mock-function-principal"],
			[paths.webPubSub, "12cf5a90-567b-43ae-8102-96cf46c7d9b4", "mock-pipeline-principal"],
		]) {
			expect(roleWrites.filter(({ path }) =>
				path.startsWith(`${scope}/providers/microsoft.authorization/roleassignments/`)))
				.toEqual(expect.arrayContaining([{
					path: expect.any(String),
					body: { properties: {
						roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
						principalId, principalType: "ServicePrincipal",
					} },
				}]));
		}
		const functionWrite = writes.find(({ path }) => path === paths.functionApp);
		expect(functionWrite?.body).toEqual(expect.objectContaining({
			identity: { type: "SystemAssigned" },
			properties: expect.objectContaining({
				serverFarmId: expect.stringMatching(/zeninstaller-private-rg.*serverfarms/i),
				siteConfig: expect.objectContaining({
					cors: { allowedOrigins: [new URL(CORP_URL).origin] },
					appSettings: expect.arrayContaining([
						{ name: "SESSION_TABLE_ACCOUNT_NAME", value: names.storage },
						{ name: "WEBPUBSUB_ENDPOINT", value: `${names.webPubSub}.webpubsub.azure.com` },
					]),
				}),
			}),
		}));
		expect(writes.some(({ path }) => path.endsWith("/blobservices/default"))).toBe(false);
		await expectSnapshot(page, card, testInfo, "created", viewportName);
	});
	await test.step("Reload and read saved connection details", async () => {
		await page.reload();
		await openRemoteTerminalCard(page);
		await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled();
		await expect(card.getByText(`Resource group: ${backendResourceGroup}`, { exact: true })).toBeVisible();
		await openConnectionDetails(card);
		for (const key of terminalKeys) await expect(connectionInput(card, key)).toHaveValue(github.variables[key]);
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
		expect(github.variables.API_STORAGE_ACCOUNT).toBe(names.storage);
		await expectSnapshot(page, card, testInfo, "persisted", viewportName);
	});
	await test.step("Re-run without replacing the pipeline identity or resources", async () => {
		const writeCount = writes.length;
		await card.getByRole("button", { name: "Re-run", exact: true }).click();
		await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 60_000 });
		await expectSuccessfulSteps(card, remoteTerminalStepLabels(names));
		expect(graph.applicationWrites).toHaveLength(1);
		expect(graph.servicePrincipalWrites).toHaveLength(1);
		expect(graph.federatedCredentialWrites).toHaveLength(1);
		expect(writes).toHaveLength(writeCount);
		expect(resources.size).toBe(10);
		await expectSnapshot(page, card, testInfo, "rerun", viewportName);
	});
	await test.step("Keep an unsaved connection edit while details are collapsed", async () => {
		const input = connectionInput(card, "VITE_API_URL");
		const original = await input.inputValue();
		await input.fill("https://unsaved.example");
		await expect(card.getByRole("button", { name: "Save 1 variable", exact: true })).toBeEnabled();
		const collapse = card.getByRole("button", { name: "collapse", exact: true });
		await expect(collapse).toHaveAttribute("aria-controls", "remote-terminal-connection-details");
		await collapse.click();
		await expect(card.getByRole("button", { name: "open to enter connection detail", exact: true }))
			.toHaveAttribute("aria-expanded", "false");
		await expect(input).toBeHidden();
		await openConnectionDetails(card);
		await expect(input).toHaveValue("https://unsaved.example");
		await input.fill(original);
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
		expect(github.variables.VITE_API_URL).toBe(original);
		await expectSnapshot(page, card, testInfo, "end", viewportName);
	});
	expect(unexpectedRequests, "No unmocked external requests").toEqual([]);
}
