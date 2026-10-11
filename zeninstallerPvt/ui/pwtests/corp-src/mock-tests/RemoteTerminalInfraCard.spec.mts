/// <reference types="node" />
// UI component: ../../../corp-src/cards/RemoteTerminalInfra/RemoteTerminalInfraCard.tsx
import { expect, test } from "@playwright/test";
import { CORP_URL, viewports } from "../../testInit";
import { attachJSCoverage, expectSnapshot } from "../../util/testHelper.ts";
import { expectSuccessfulSteps } from "../util/mockTestHelper.mts";
import {
	connectionInput, openConnectionDetails, openRemoteTerminalCard, remoteTerminalStepLabels,
} from "../util/RemoteTerminalInfraCardHelper.mts";
import { installRelayNetworkGuard, prepareMockRelay } from "../util/RemoteTerminalInfraCardMockHelper.mts";

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

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Remote Terminal Infrastructure Card Mock - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1 });

		test("Happy path provisions the website and both relay identities", async ({ page, context }, testInfo) => {
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
		});

		test("Shows provisioning failure and allows a successful retry", async ({ page, context }, testInfo) => {
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

		test("Stops at the storage data-plane consent boundary", async ({ page, context }) => {
			const { card, graph, resources, writes, website, unexpectedRequests } =
				await prepareMockRelay(page, context, viewportName, { requireStorageConsent: true });
			await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
			const consent = card.getByText("Consent to the storage data plane", { exact: true }).locator("../..");
			await expect(consent.getByRole("progressbar")).toBeVisible();
			await expect(card.getByRole("button", { name: "Create terminal relay", exact: true })).toBeEnabled();
			expect(await page.evaluate(() => localStorage.getItem("zeninstaller_mock_storage_consent_scopes")))
				.toContain("https://storage.azure.com/user_impersonation");
			expect(website.staticWebsiteWrite).toBeNull();
			expect(writes.some(({ path }) => path.includes("/blobservices/default"))).toBe(false);
			expect(resources.size).toBeGreaterThan(0);
			expect(graph.applicationWrites).toHaveLength(0);
			expect(unexpectedRequests).toEqual([]);
		});

		test("Reports website CORS failure and retries provisioning", async ({ page, context }, testInfo) => {
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

		test("Reports a missing GitHub repository instead of starting Azure writes", async ({ page, context }) => {
			const { card, github, resources, writes, graph, unexpectedRequests } =
				await prepareMockRelay(page, context, viewportName, { omitRepository: true });
			await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
			await expect(card.getByText("Select the GitHub account and repository first — the OIDC credentials are scoped to them", { exact: true })).toBeVisible();
			expect(resources.size).toBe(0);
			expect(writes).toHaveLength(0);
			expect(graph.applicationWrites).toHaveLength(0);
			expect(terminalKeys.some((key) => key in github.variables)).toBe(false);
			expect(unexpectedRequests).toEqual([]);
		});

		test("Requires authentication before creating relay resources", async ({ page, context }, testInfo) => {
			const unexpectedRequests = await installRelayNetworkGuard(context);
			await page.goto(CORP_URL);
			const card = page.locator("#card-remote_terminal_infra");
			await card.getByText("Private Zeninstaller Environment", { exact: true }).click();
			await expect(card.getByText("Sign in to Azure", { exact: true })).toBeVisible();
			await expect(card.getByRole("button", { name: /Create terminal relay|Re-run/ })).toHaveCount(0);
			await expectSnapshot(page, card, testInfo, "authentication-required", viewportName);
			expect(unexpectedRequests).toEqual([]);
		});
	});
}
