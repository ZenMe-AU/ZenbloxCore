import { type BrowserContext, type Locator, type Page } from "@playwright/test";
import {
	AZURE_MANAGEMENT_URL, CORP_URL, GITHUB_API_URL, MICROSOFT_GRAPH_URL, TEST_REPO_MAIN,
} from "../../testInit";
import { getWebStorageAccountName } from "../../../corp-src/logic/naming.ts";
import {
	installCoreInfraAzureMock, installMockAzure, installMockGitHub, mockSubscriptionId, mockTenantId,
} from "./mockTestHelper.mts";
import { openRemoteTerminalCard } from "./RemoteTerminalInfraCardHelper.mts";

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
	core.roleAssignments.set(`/subscriptions/${mockSubscriptionId}/resourcegroups/root-pwtests`,
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
