import { type BrowserContext, type Page } from "@playwright/test";
import { AZURE_MANAGEMENT_URL, CORP_URL, GITHUB_API_URL, MICROSOFT_GRAPH_URL, TEST_REPO_MAIN } from "../../testInit";
import { installMockAzure, installMockGitHub, mockSubscriptionId, mockTenantId } from "./mockTestHelper.mts";
import {
	backendInsights, backendLaw, backendResourceGroup, defaultBackendNames, openRemoteTerminalCard,
	pipelineAppName, type BackendNames,
} from "./RemoteTerminalInfraCardHelper.mts";

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
