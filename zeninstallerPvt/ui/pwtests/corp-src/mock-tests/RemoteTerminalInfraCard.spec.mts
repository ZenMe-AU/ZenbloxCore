/// <reference types="node" />
// UI component: ../../../corp-src/cards/RemoteTerminalInfra/RemoteTerminalInfraCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { getViewportName, test } from "../../../../../.playwright/viewportFixture.mjs";
import { CORP_URL } from "../../testInit";
import { expectSnapshot } from "../../../../../.playwright/testHelper.js";
import { expectSuccessfulSteps, installMockAzure, installMockGitHub, mockSubscriptionId, mockTenantId } from "../util/mockTestHelper.mts";
import {backendInsights, backendLaw, BackendNames, backendResourceGroup, connectionInput, defaultBackendNames, openConnectionDetails, openRemoteTerminalCard, pipelineAppName, remoteTerminalStepLabels, terminalKeys,
} from "../util/RemoteTerminalInfraCardHelper.mts";
import { AZURE_MANAGEMENT_URL, GITHUB_API_URL, MICROSOFT_GRAPH_URL, TEST_REPO_MAIN } from "../../testInit.js";



test("Happy path", async ({ page, context }, testInfo) => {
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

export const pipelineClientId = "00000000-0000-0000-0000-000000000005";
export const insightsConnectionString =
	"InstrumentationKey=mock-insights-key;IngestionEndpoint=https://australiaeast-1.in.applicationinsights.azure.com/";
export type RelayMockOptions = {
	failProvisioningOnce?: boolean;
	failPipelinePrincipalOnce?: boolean;
	failVariableWriteOnce?: boolean;
	environment?: "PROD" | "TEST";
	savedNames?: BackendNames;
	existingGroups?: { storage: string; webPubSub: string; functionApp: string };
	nameTakenOnce?: boolean;
};
type GraphApplication = { appId: string; id: string; displayName: string; body: Record<string, unknown> };
type RoleAssignment = { properties: { principalId: string; roleDefinitionId: string; principalType: string } };

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
			export const ensureScopeConsent = async () => {
				localStorage.setItem("zeninstaller_mock_storage_consent_requested", "true");
				throw new Error("Backend provisioning must not request browser storage consent");
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
	const names = options.savedNames ?? defaultBackendNames(mockSubscriptionId);
	const environment = options.environment ?? "PROD";
	const github = await installMockGitHub(page, context, {
		repositoryName: repoName, branches: ["main", "PROD", "TEST"],
		initialVariables: {
			AZURE_TENANT_ID: mockTenantId, AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
			...(options.savedNames ? {
				API_STORAGE_ACCOUNT: names.storage,
				WEBPUBSUB_ENDPOINT: `${names.webPubSub}.webpubsub.azure.com`,
				VITE_API_URL: `https://${names.functionApp}.azurewebsites.net`,
			} : {}),
		},
	});
	let variableWriteFailed = false;
	await page.route(`${GITHUB_API_URL}/**/environments/${environment}/variables`, async (route) => {
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
		applications: new Map<string, GraphApplication>(),
		servicePrincipals: new Map<string, string>(),
		federatedCredentials: new Map<string, Record<string, unknown>[]>(),
	};
	let principalFailed = false;
	await page.route(`${MICROSOFT_GRAPH_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const filter = url.searchParams.get("$filter") ?? "";
		if (url.pathname === "/v1.0/applications" && request.method() === "GET" &&
			filter === `displayName eq '${pipelineAppName}'`) {
			const app = graph.applications.get(pipelineAppName);
			return route.fulfill({ json: { value: app ? [{ id: app.id, appId: app.appId }] : [] } });
		}
		if (url.pathname === "/v1.0/applications" && request.method() === "POST") {
			const body = request.postDataJSON() as Record<string, unknown> & { displayName: string };
			if (body.displayName !== pipelineAppName) {
				unexpectedRequests.push(`Unexpected backend app registration: ${body.displayName}`);
				return route.abort("blockedbyclient");
			}
			const app = { appId: pipelineClientId, id: "mock-pipeline-app", displayName: body.displayName, body };
			graph.applicationWrites.push(app);
			graph.applications.set(app.displayName, app);
			return route.fulfill({ status: 201, json: { id: app.id, appId: app.appId } });
		}
		if (url.pathname === "/v1.0/servicePrincipals" && request.method() === "GET" &&
			filter === `appId eq '${pipelineClientId}'`) {
			const id = graph.servicePrincipals.get(pipelineClientId);
			return route.fulfill({ json: { value: id ? [{ id }] : [] } });
		}
		if (url.pathname === "/v1.0/servicePrincipals" && request.method() === "POST") {
			const { appId } = request.postDataJSON() as { appId: string };
			if (appId !== pipelineClientId) {
				unexpectedRequests.push(`Unexpected backend service principal: ${appId}`);
				return route.abort("blockedbyclient");
			}
			if (options.failPipelinePrincipalOnce && !principalFailed) {
				principalFailed = true;
				return route.fulfill({ status: 403, json: { error: { message: "Mock pipeline principal denied" } } });
			}
			const id = "mock-pipeline-principal";
			graph.servicePrincipalWrites.push({ appId, id });
			graph.servicePrincipals.set(appId, id);
			return route.fulfill({ status: 201, json: { id } });
		}
		if (url.pathname === "/v1.0/applications/mock-pipeline-app/federatedIdentityCredentials") {
			if (request.method() === "GET") {
				return route.fulfill({ json: { value: graph.federatedCredentials.get("mock-pipeline-app") ?? [] } });
			}
			if (request.method() === "POST") {
				const body = request.postDataJSON() as Record<string, unknown>;
				const entries = graph.federatedCredentials.get("mock-pipeline-app") ?? [];
				entries.push(body);
				graph.federatedCredentials.set("mock-pipeline-app", entries);
				graph.federatedCredentialWrites.push(body);
				return route.fulfill({ status: 201, json: body });
			}
		}
		return route.fallback();
	});

	const resources = new Map<string, Record<string, unknown>>();
	const writes: { path: string; body: Record<string, unknown> }[] = [];
	const roles = new Map<string, RoleAssignment[]>();
	const availabilityChecks: { path: string; body: Record<string, unknown> }[] = [];
	const listRequests: string[] = [];
	const group = options.existingGroups ?? { storage: backendResourceGroup, webPubSub: backendResourceGroup, functionApp: backendResourceGroup };
	const resourcePath = (rg: string, suffix: string) =>
		`/subscriptions/${mockSubscriptionId}/resourcegroups/${rg}/providers/${suffix}`.toLowerCase();
	const defaultAppSettingsPath = resourcePath(backendResourceGroup,
		`microsoft.web/sites/${defaultBackendNames(mockSubscriptionId).functionApp}/config/appsettings/list`);
	const paths = {
		resourceGroup: `/subscriptions/${mockSubscriptionId}/resourcegroups/${backendResourceGroup}`,
		law: resourcePath(backendResourceGroup, `microsoft.operationalinsights/workspaces/${backendLaw}`),
		insights: resourcePath(backendResourceGroup, `microsoft.insights/components/${backendInsights}`),
		storage: resourcePath(group.storage, `microsoft.storage/storageaccounts/${names.storage}`),
		webPubSub: resourcePath(group.webPubSub, `microsoft.signalrservice/webpubsub/${names.webPubSub}`),
		plan: resourcePath(group.functionApp, `microsoft.web/serverfarms/${names.functionApp}-plan`),
		functionApp: resourcePath(group.functionApp, `microsoft.web/sites/${names.functionApp}`),
	};
	const resourcePaths = new Set([
		...Object.values(paths), `${paths.storage}/tableservices/default/tables/sessions`,
		`${paths.storage}/blobservices/default/containers/deployment`, `${paths.webPubSub}/hubs/terminal`,
	]);
	if (options.existingGroups) {
		for (const key of ["storage", "webPubSub", "functionApp"] as const) {
			resources.set(paths[key], {
				id: paths[key], name: names[key], properties: { provisioningState: "Succeeded" },
				...(key === "functionApp" ? { identity: { type: "SystemAssigned", principalId: "mock-function-principal" } } : {}),
			});
		}
	}
	let provisioningFailed = false;
	let nameTaken = false;
	await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname.toLowerCase();
		const method = request.method();
		if (path.endsWith("/locations") && method === "GET") {
			return route.fulfill({ json: { value: [
				{ name: "australiaeast", displayName: "Australia East", metadata: { regionType: "Physical" } },
				{ name: "australiasoutheast", displayName: "Australia Southeast", metadata: { regionType: "Physical" } },
			] } });
		}
		if (/^\/subscriptions\/[^/]+\/providers\/microsoft\.[^/]+$/.test(path) && method === "GET") {
			return route.fulfill({ json: { registrationState: "Registered" } });
		}
		if (path.endsWith("/checknameavailability") && method === "POST") {
			availabilityChecks.push({ path, body: request.postDataJSON() as Record<string, unknown> });
			if (options.nameTakenOnce && !nameTaken) {
				nameTaken = true;
				return route.fulfill({ json: { nameAvailable: false } });
			}
			return route.fulfill({ json: { nameAvailable: true } });
		}
		for (const [suffix, key] of [
			["microsoft.storage/storageaccounts", "storage"],
			["microsoft.signalrservice/webpubsub", "webPubSub"],
			["microsoft.web/sites", "functionApp"],
		] as const) {
			if (path === `/subscriptions/${mockSubscriptionId}/providers/${suffix}` && method === "GET") {
				listRequests.push(path);
				const existing = resources.get(paths[key]);
				return route.fulfill({ json: { value: existing ? [{ ...existing, name: names[key] }] : [] } });
			}
		}
		if (path.endsWith(`/sites/${names.functionApp}/config/appsettings/list`) && method === "POST") {
			return route.fulfill({ json: { properties: {
				ALLOWED_ORIGINS: new URL(CORP_URL).origin,
				WEBPUBSUB_ENDPOINT: `${names.webPubSub}.webpubsub.azure.com`,
				HUB_NAME: "terminal", SESSION_TABLE_ACCOUNT_NAME: names.storage, SESSION_TABLE_NAME: "sessions",
			} } });
		}
		if (path === defaultAppSettingsPath && method === "POST") {
			// Deployment status can read the unversioned default before the saved custom target restores.
			return route.fulfill({ json: { properties: {} } });
		}
		const roleIndex = path.indexOf("/providers/microsoft.authorization/roleassignments");
		if (roleIndex >= 0 && Object.values(paths).includes(path.slice(0, roleIndex))) {
			const scope = path.slice(0, roleIndex);
			if (method === "GET") {
				const principalId = /^assignedTo\('([^']+)'\)$/.exec(url.searchParams.get("$filter") ?? "")?.[1];
				return route.fulfill({ json: { value: (roles.get(scope) ?? []).filter(
					(assignment) => assignment.properties.principalId === principalId,
				) } });
			}
			if (method === "PUT") {
				const body = request.postDataJSON() as RoleAssignment;
				roles.set(scope, [...(roles.get(scope) ?? []), body]);
				writes.push({ path, body });
				return route.fulfill({ json: body });
			}
		}
		if (!resourcePaths.has(path)) {
			if (["PUT", "POST", "PATCH", "DELETE"].includes(method)) {
				unexpectedRequests.push(`${method} ${request.url()}`);
				return route.abort("blockedbyclient");
			}
			return route.fallback();
		}
		if (method === "GET") {
			return resources.has(path)
				? route.fulfill({ json: resources.get(path) })
				: route.fulfill({ status: 404, json: { error: { code: "ResourceNotFound" } } });
		}
		if (method === "PUT") {
			if (options.failProvisioningOnce && !provisioningFailed && path === paths.insights) {
				provisioningFailed = true;
				return route.fulfill({ status: 403, json: { error: {
					code: "AuthorizationFailed", message: "Mock provisioning permission denied",
				} } });
			}
			const body = request.postDataJSON() as Record<string, unknown>;
			writes.push({ path, body });
			const resource = {
				...body, id: path,
				properties: {
					...((body.properties as Record<string, unknown> | undefined) ?? {}),
					provisioningState: "Succeeded",
					...(path === paths.insights ? { ConnectionString: insightsConnectionString } : {}),
				},
				...(path === paths.functionApp ? { identity: { type: "SystemAssigned", principalId: "mock-function-principal" } } : {}),
			};
			resources.set(path, resource);
			return route.fulfill({ json: resource });
		}
		return route.fallback();
	});
	const url = new URL(CORP_URL);
	url.search = new URLSearchParams({
		account: "mock-user", repo: repoName, env: environment,
		tenant: mockTenantId, subscription: mockSubscriptionId,
	}).toString();
	await page.goto(url.toString());
	const card = await openRemoteTerminalCard(page);
	return {
		card, names, tenantId: mockTenantId, repoName, environment, github, azure, graph,
		resources, writes, roles, paths, availabilityChecks, listRequests, unexpectedRequests,
	};
}

