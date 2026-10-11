/// <reference types="node" />
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { AZURE_MANAGEMENT_URL, CORP_URL, GITHUB_API_URL, TEST_REPO_MAIN } from "../../testInit";
import { installMockAzure, installMockGitHub, mockSubscriptionId, mockTenantId } from "./mockTestHelper.mts";
import { installRelayNetworkGuard } from "./RemoteTerminalInfraCardMockHelper.mts";
import { openBackendCard } from "./BackendDeployCardHelper.mts";

const sha = "abcdef1234567890abcdef1234567890abcdef12";
export const previousBuild = {
	version: "mock-backend-v0", sha: "1234567890abcdef1234567890abcdef12345678",
	runId: "11111", artifactId: 67889, builtAt: 1_755_000_000,
};
export const backendBuild = {
	version: "mock-backend-v1", sha, runId: "22222", artifactId: 67890, builtAt: 1_759_622_400,
};

type BuildOutcome = "success" | "failed" | "cancelled" | "timeout";
type DeploymentOutcome = "success" | "failed" | "timeout";
type SeedBuild = "current" | "update";

export type MockBackendOptions = {
	missingArtifact?: boolean;
	failUploadOnce?: boolean;
	failBuild?: boolean;
	buildOutcome?: BuildOutcome;
	artifactDownloadStatus?: number;
	deploymentOutcome?: DeploymentOutcome;
	failSettingsWrite?: boolean;
	failVersionRead?: boolean;
	seedBuild?: SeedBuild;
};

export async function prepareMockBackend(
	page: Page, context: BrowserContext, viewportName: string, options: MockBackendOptions = {},
) {
	await page.clock.install({ time: new Date("2026-10-05T02:00:00Z") });
	const unexpectedRequests = await installRelayNetworkGuard(context);
	const repoName = `${TEST_REPO_MAIN}-${viewportName}`;
	const corpName = "pwtests";
	const installerClientId = "00000000-0000-0000-0000-000000000006";
	const appInsightsConnectionString = "InstrumentationKey=mock-key;IngestionEndpoint=https://mock.applicationinsights.azure.com/";
	const initialVariables = {
		NAME: corpName,
		AZURE_TENANT_ID: mockTenantId,
		AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
		WEBPUBSUB_ENDPOINT: "pwtests-wpubsub.webpubsub.azure.com",
		WEBPUBSUB_CLIENT_ID: "00000000-0000-0000-0000-000000000005",
		WEBPUBSUB_TENANT_ID: mockTenantId,
		VITE_API_URL: "https://pwtests-terminal-app.azurewebsites.net",
		VITE_AZURE_CLIENT_ID: installerClientId,
		VITE_APPINSIGHTS_CONNECTION_STRING: appInsightsConnectionString,
	};
	await context.addInitScript((values) => {
		localStorage.setItem("zeninstaller_azure_result", JSON.stringify({
			clientId: values.installerClientId, tenantId: values.tenantId, subscriptionIds: [values.subscriptionId],
		}));
		localStorage.setItem("zeninstaller_infra_result", JSON.stringify({
			corpName: values.corpName, subscriptionId: values.subscriptionId,
		}));
		localStorage.setItem("zeninstaller_remote_terminal_infra_result", JSON.stringify({
			corpName: values.corpName, subscriptionId: values.subscriptionId,
			apiUrl: values.apiUrl, webPubSubHost: values.webPubSubHost, hubName: "terminal",
			pipelineClientId: values.pipelineClientId, pipelineTenantId: values.tenantId,
			installerClientId: values.installerClientId, appInsightsConnectionString: values.appInsightsConnectionString,
		}));
		sessionStorage.setItem("zeninstaller_arm_tenant", values.tenantId);
	}, {
		installerClientId, tenantId: mockTenantId, subscriptionId: mockSubscriptionId, corpName,
		apiUrl: initialVariables.VITE_API_URL, webPubSubHost: initialVariables.WEBPUBSUB_ENDPOINT,
		pipelineClientId: initialVariables.WEBPUBSUB_CLIENT_ID, appInsightsConnectionString,
	});
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
			const reject = async () => { throw new Error("Unexpected authentication redirect in backend mock"); };
			export const getMsal = async () => ({ handleRedirectPromise: async () => null,
				getAllAccounts: () => [account], acquireTokenSilent: async () => ({ account, accessToken: "mock-token" }),
				loginRedirect: reject, acquireTokenRedirect: reject, clearCache: async () => {} });
			export const ensureScopeConsent = async () => false;
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
	const github = await installMockGitHub(page, context, {
		repositoryName: repoName, branches: ["main", "PROD"], initialVariables,
	});
	const azure = await installMockAzure(page, {
		appDisplayName: "zeninstaller-pwtests", servicePrincipalCreated: true, rbacAssigned: true,
	});
	const seededBuild = options.seedBuild
		? options.missingArtifact
			? { ...backendBuild, artifactId: null }
			: backendBuild
		: options.missingArtifact || options.failUploadOnce
			? options.missingArtifact ? { ...backendBuild, artifactId: null } : backendBuild
			: null;
	const state = {
		latestBuild: seededBuild,
		buildDispatched: false,
		dispatches: [] as { ref: string; inputs: { github_env_name: string } }[],
		downloads: 0,
		uploads: 0,
		deployRequests: 0,
		deploymentPolls: 0,
		deploymentPollsAfterUpload: 0,
		settingsReads: 0,
		settingsWriteAttempts: 0,
		settingsWrites: 0,
		settings: {
			ALLOWED_ORIGINS: new URL(CORP_URL).origin, SESSION_TABLE_NAME: "sessions",
			WEBPUBSUB_ENDPOINT: "pwtests-wpubsub.webpubsub.azure.com",
			...(options.seedBuild === "current" ? {
				BACKEND_VERSION: backendBuild.version, BACKEND_SHA: backendBuild.sha, BACKEND_BUILT_AT: String(backendBuild.builtAt),
			} : options.seedBuild === "update" ? {
				BACKEND_VERSION: previousBuild.version, BACKEND_SHA: previousBuild.sha, BACKEND_BUILT_AT: String(previousBuild.builtAt),
			} : {}),
		} as Record<string, string>,
	};
	const zip = Buffer.from("504b0506000000000000000000000000000000000000", "hex");
	await page.route(`${GITHUB_API_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.pathname.endsWith("/deployments") && url.searchParams.get("task") === "build:backend") {
			expect(url.searchParams.get("environment")).toBe("PROD");
			const nextBuild = state.buildDispatched && options.buildOutcome === "success" ? backendBuild : state.latestBuild;
			return route.fulfill({ json: nextBuild ? [{
				payload: nextBuild,
				created_at: new Date(nextBuild.builtAt * 1000).toISOString(), sha: nextBuild.sha,
			}] : [] });
		}
		if (url.pathname.endsWith("/actions/workflows/buildBackend.yml/dispatches") && request.method() === "POST") {
			state.dispatches.push(request.postDataJSON());
			if (options.failBuild) return route.fulfill({ status: 403, json: { message: "Mock build permission denied" } });
			state.buildDispatched = true;
			if (!options.buildOutcome || options.buildOutcome === "success") state.latestBuild = backendBuild;
			return route.fulfill({ status: 204 });
		}
		if (url.pathname.endsWith(`/actions/artifacts/${state.latestBuild?.artifactId}/zip`) && state.latestBuild?.artifactId != null) {
			state.downloads++;
			if (options.artifactDownloadStatus) {
				return route.fulfill({ status: options.artifactDownloadStatus, body: "Mock artifact expired" });
			}
			return route.fulfill({ contentType: "application/zip", body: zip, headers: { "Content-Length": String(zip.length) } });
		}
		if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
			relay.unexpectedRequests.push(`${request.method()} ${request.url()}`);
			return route.abort("blockedbyclient");
		}
		return route.fallback();
	});

	const appSettingsPath = "/sites/pwtests-terminal-app/config/appsettings";
	const appPath = "/subscriptions/mock-subscription/resourcegroups/root-pwtests/providers/microsoft.web/sites/pwtests-terminal-app";
	await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname.toLowerCase();
		const method = request.method();
		if (path.endsWith(`${appSettingsPath}/list`) && method === "POST") {
			state.settingsReads++;
			if (options.failVersionRead && state.settingsWrites > 0) {
				return route.fulfill({ status: 503, body: "Mock app-settings read failure" });
			}
			return route.fulfill({ json: { properties: state.settings } });
		}
		if (path.endsWith(appSettingsPath) && method === "PUT") {
			state.settingsWriteAttempts++;
			if (options.failSettingsWrite) {
				return route.fulfill({ status: 503, body: "Mock app-settings write failure" });
			}
			state.settingsWrites++;
			state.settings = (request.postDataJSON() as { properties: Record<string, string> }).properties;
			return route.fulfill({ json: { properties: state.settings } });
		}
		if (path.endsWith(`${appPath}/extensions/onedeploy`) && method === "PUT") {
			state.deployRequests++;
			state.uploads++;
			expect(request.headers()["content-type"]).toBe("application/zip");
			expect(request.postDataBuffer()).toEqual(zip);
			if (options.failUploadOnce && state.uploads === 1) {
				return route.fulfill({ status: 500, body: "Mock upload failure" });
			}
			return route.fulfill({ status: 202, json: {} });
		}
		if (path.endsWith(`${appPath}/deployments`) && method === "GET") {
			state.deploymentPolls++;
			if (state.uploads > 0) state.deploymentPollsAfterUpload++;
			if (options.deploymentOutcome === "timeout") return route.fulfill({ json: { value: [] } });
			return route.fulfill({ json: { value: [{
				properties: options.deploymentOutcome === "failed"
					? { status: 3, message: "Mock package unpack failure", end_time: new Date(Date.now()).toISOString() }
					: { status: 4, end_time: new Date(Date.now()).toISOString() },
			}] } });
		}
		if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
			relay.unexpectedRequests.push(`${method} ${request.url()}`);
			return route.abort("blockedbyclient");
		}
		return route.fallback();
	});
	await page.route("https://pwtests-terminal-app.scm.azurewebsites.net/**", async (route) => {
		unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
		await route.abort("blockedbyclient");
	});
	const url = new URL(CORP_URL);
	url.search = new URLSearchParams({
		account: "mock-user", repo: repoName, env: "PROD", tenant: mockTenantId, subscription: mockSubscriptionId,
	}).toString();
	await page.goto(url.toString());
	await page.reload();
	return { card: await openBackendCard(page), state, initialVariables, github, azure, tenantId: mockTenantId, unexpectedRequests };
}
