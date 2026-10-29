// UI component: ../../../corp-src/cards/CreateDomain/CreateDomainCard.tsx
import { expect } from "@playwright/test";
import { getViewportName, test } from "../../../../../.playwright/viewportFixture.mjs";
import { AZURE_MANAGEMENT_URL, CORP_URL, MICROSOFT_GRAPH_URL } from "../../testInit";
import { expectSnapshot, safePathSegment } from "../../../../../.playwright/testHelper.js";
import {
	expectSuccessfulSteps,
	installCoreInfraAzureMock,
	installCreateDomainAzureMock,
	installMockAzure,
	installMockGitHub,
	mockSubscriptionId,
	mockTenantId,
	type CreateDomainAzureMockState,
} from "../util/mockTestHelper.mts";

const companyShortCode = "pwtests";
const domainName = "pwtests.example";
const mockClientId = "00000000-0000-0000-0000-000000000002";

const authenticationModule = (rejectConsent: boolean) => `
export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
export const PINNED_TENANT_ID = ${JSON.stringify(mockTenantId)};
export const LOGIN_AUTHORITY = "https://login.microsoftonline.com/" + PINNED_TENANT_ID;
export function cleanTenantId(value) {
	const tenant = value?.trim();
	return !tenant || tenant === "undefined" || tenant === "null" ? undefined : tenant;
}
const tenantId = ${JSON.stringify(mockTenantId)};
const account = {
	homeAccountId: "mock-home." + tenantId,
	environment: "login.microsoftonline.com",
	tenantId,
	localAccountId: "mock-user-id",
	username: "mock-user@example.com",
	name: "Mock Azure User",
	tenantProfiles: new Map([[tenantId, { tenantId, isHomeTenant: true }]]),
};
let activeAccount = account;
const msal = {
	handleRedirectPromise: async () => null,
	getAllAccounts: () => [account],
	getActiveAccount: () => activeAccount,
	setActiveAccount: (value) => { activeAccount = value; },
	acquireTokenSilent: async () => ({ account, accessToken: "mock-access-token" }),
	acquireTokenRedirect: async () => { throw new Error("AADSTS65001: consent_required"); },
	loginRedirect: async () => { throw new Error("Unexpected authentication redirect in a mock test."); },
	clearCache: async () => {},
};
export const getMsal = async () => msal;
export const ensureScopeConsent = async () => {
	if (${rejectConsent}) throw new Error("AADSTS65001: consent_required");
	return false;
};
export const getToken = async () => "mock-access-token";
export function setActiveAzureIdentity(value) { activeAccount = value; }
export const getMsToken = async () => activeAccount ? "mock-access-token" : null;
export async function requireMsToken() {
	const token = await getMsToken();
	if (!token) throw new Error("No mocked Microsoft account is active.");
	return token;
}
`;

const initialSetupStepLabels = [
	"Confirm Microsoft permissions",
	"Register required Azure resource providers",
	`Create resource group zbcore-${companyShortCode}-rg`,
	`Create Log Analytics workspace zbcore-${companyShortCode}-law`,
	`Create DNS zone ${domainName}`,
	"Add custom domain to Entra ID",
	"Create domain-verification TXT record",
	"Set as primary domain",
	"Grant domain permission to the pipeline",
];

const rerunStepLabels = initialSetupStepLabels;

type DomainMockOptions = {
	initialAzureState?: Partial<CreateDomainAzureMockState>;
	persistedDomainStatus?: { verified: boolean; primary: boolean };
	failDnsZoneCreates?: number;
	delayDomainVerificationAttempts?: number;
	failDomainStatusCheck?: boolean;
	rejectConsent?: boolean;
	savedDomain?: boolean;
};

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath({ page, context }, testInfo);
});

test("Restores an unverified DNS zone and verifies without making it primary", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(180_000);
	const { card, prepared, azure, resourceWrites, dnsZoneQueries } = await prepareDomainCard(page, context, viewportName, {
		savedDomain: true,
		initialAzureState: { domainExists: true, dnsZoneExists: true, dnsTxtExists: true },
	});
	await expect(card.getByText("Checking whether this domain is already set up...", { exact: true })).toBeHidden();
	await expect(card.getByRole("button", { name: "Verify domain now", exact: true })).toBeEnabled();
	await expect(card.getByText("Point your domain at Azure DNS", { exact: true })).toBeVisible();
	await expect(card.getByText("ns1.mock.azure-dns.com.", { exact: true })).toBeVisible();
	expect(dnsZoneQueries.length).toBeGreaterThan(0);
	expect(resourceWrites).toEqual([]);
	const primaryChoice = card.getByRole("checkbox", { name: /as the tenant's primary domain/ });
	await expect(primaryChoice).toHaveCount(2);
	await expect(primaryChoice.first()).toBeChecked();
	await primaryChoice.first().uncheck();
	await expect(primaryChoice.last()).not.toBeChecked();
	await page.reload();
	await openDomainCard(card);
	await expect(primaryChoice.first()).not.toBeChecked();
	await expect(card.getByRole("button", { name: "Verify domain now", exact: true })).toBeEnabled();
	await card.getByRole("button", { name: "Verify domain now", exact: true }).click();
	await expect(card.getByText(`Domain ${domainName} is verified.`, { exact: true })).toBeVisible();
	await expect(card.getByRole("button", { name: "Verify domain now", exact: true })).toHaveCount(0);
	expect(azure.domainVerified).toBe(true);
	expect(azure.domainPrimary).toBe(false);
	expect(prepared.github.variables.CORE_RESOURCE_GROUP).toBe("zbcore-pwtests-rg");
	await page.reload();
	await openDomainCard(card);
	await expect(card.getByText(`Domain ${domainName} is verified.`, { exact: true })).toBeVisible();
	await expect(primaryChoice).not.toBeChecked();
	await expect(card.getByText("CORE_RESOURCE_GROUP", { exact: true })).toHaveCount(0);
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
	expect(resourceWrites).toEqual([]);
	await expectSnapshot(page, card, testInfo, "restored-verified-not-primary", viewportName);
});

test("Retries setup after a temporary DNS-zone failure", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(240_000);
	const { card, azure, unexpectedRequests, getDnsZoneCreateAttempts } = await prepareDomainCard(
		page,
		context,
		viewportName,
		{ failDnsZoneCreates: 1 },
	);
	await card.getByRole("textbox").fill(domainName);
	await card.getByRole("button", { name: "Save 1 variable" }).click();
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
	await card.getByRole("button", { name: "Set up core DNS domain" }).click();
	await expect(card.getByText("Running...", { exact: true })).toBeHidden();
	const dnsStep = card.getByText(`Create DNS zone ${domainName}`, { exact: true }).locator("../..");
	await expect(dnsStep.locator('svg[data-testid="ErrorOutlineIcon"]')).toHaveCount(1);
	expect(azure.dnsZoneExists).toBe(false);
	await card.getByRole("button", { name: "Start over" }).click();
	await card.getByRole("button", { name: "Set up core DNS domain" }).click();
	await expect(card.getByText("Running...", { exact: true })).toBeHidden();
	await expectSuccessfulSteps(card, initialSetupStepLabels);
	expect(getDnsZoneCreateAttempts()).toBe(2);
	expect(azure.dnsZoneExists).toBe(true);
	expect(azure.dnsTxtExists).toBe(true);
	await expectSnapshot(page, card, testInfo, "dns-zone-retry", viewportName);
});

test("Stops setup when MS consent is denied", async ({ page, context }, testInfo) => {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(180_000);
	const { card, azure, unexpectedRequests } = await prepareDomainCard(page, context, viewportName, {
		rejectConsent: true,
	});
	await card.getByRole("textbox").fill(domainName);
	await card.getByRole("button", { name: "Save 1 variable" }).click();
	await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
	await card.getByRole("button", { name: "Set up core DNS domain" }).click();
	await expect(card.getByText("Running...", { exact: true })).toBeHidden();
	const consentStep = card.getByText("Confirm Microsoft permissions", { exact: true }).locator("../..");
	await expect(consentStep.locator('svg[data-testid="ErrorOutlineIcon"]')).toHaveCount(1);
	await expect(card.getByText(/Consent redirect failed/i)).toBeVisible();
	expect(azure.dnsZoneExists).toBe(false);
	expect(azure.domainExists).toBe(false);
	await expectSnapshot(page, card, testInfo, "consent-denied", viewportName);

});

async function runHappyPath({ page, context }: { page: import("@playwright/test").Page; context: import("@playwright/test").BrowserContext }, testInfo: import("@playwright/test").TestInfo): Promise<void> {
	const viewportName = getViewportName(testInfo);
	test.setTimeout(240_000);
	const {
		card,
		prepared,
		azure,
		unexpectedRequests,
		txtRecordWrites,
		infrastructure,
		dnsZoneQueries,
		adminConsentWrites,
		getDomainVerificationAttempts,
	} = await prepareDomainCard(page, context, viewportName, { delayDomainVerificationAttempts: 1 });
	await expectSnapshot(page, card, testInfo, "start", viewportName);

	await test.step("Save variables then set up corp domain", async () => {
		const domainInput = card.getByRole("textbox");
		await expect(domainInput).toBeVisible();
		await expect(card.getByRole("progressbar")).toBeHidden();

		await domainInput.fill(domainName);
		await card.getByRole("button", { name: "Save 1 variable" }).click();
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
		await expect(domainInput).toHaveValue(domainName);
		await expect(card.getByRole("checkbox", { name: /as the tenant's primary domain/ })).toBeChecked();

		const setupButton = card.getByRole("button", { name: "Set up core DNS domain" });
		await expect(setupButton).toBeEnabled();
		await expect(card.getByText("Checking whether this domain is already set up...")).toBeHidden({
			timeout: 50_000,
		});
		await setupButton.click();

		await expect(card.getByText("Running...", { exact: true })).toBeHidden();
		await expectSuccessfulSteps(card, initialSetupStepLabels);
		expect(infrastructure.createdResources).toContain("log-analytics");
		await expect(card.getByText(`Create resource group zbcore-${companyShortCode}-rg`, { exact: true }).locator("../..")).toContainText("Already exists");
		await expect.poll(() => prepared.github.variables).toMatchObject({
			DNS: domainName,
			NAME: companyShortCode,
			CORE_RESOURCE_GROUP: "zbcore-pwtests-rg",
			AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
		});
		await expect(card.getByText("CORE_RESOURCE_GROUP", { exact: true })).toHaveCount(0);
		await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
		await expect(card.getByText(/Failed|Consent redirect failed|Additional consent required/i)).toHaveCount(0);
		await expect(card.getByRole("button", { name: "Start over" })).toBeVisible();
		await expectSnapshot(page, card, testInfo, "new-setup", viewportName);
	});

	await test.step("Reuse the existing core domain", async () => {
		await page.reload();
		await openDomainCard(card);

		const rerunButton = card.getByRole("button", { name: "Re-run setup" });
		await expect(rerunButton).toBeVisible();
		await expect(card.getByRole("button", { name: "Save variables" })).toBeDisabled();
		await rerunButton.click();
		await expect(card.getByText("Running...", { exact: true })).toBeHidden();
		await expectSuccessfulSteps(card, rerunStepLabels);
		await expect(card.getByText("Grant domain permission to the pipeline", { exact: true }).locator("../..")).toContainText("Already granted");
		expect(adminConsentWrites).toHaveLength(1);
		await expect(card.getByText(/Failed|Consent redirect failed|Additional consent required/i)).toHaveCount(0);
		await expect(card.getByRole("button", { name: "Start over" })).toBeVisible();
		await expectSnapshot(page, card, testInfo, "existing-setup", viewportName);
	});

	await test.step("Verify persisted DNS setup before propagation", async () => {
		await page.reload();
		await openDomainCard(card);

		await expect(card.getByText("Resources", { exact: true })).toBeVisible();
		await expect(card.getByText(`DNS zone: ${domainName}`, { exact: true })).toBeVisible();
		await expect(card.getByRole("button", { name: "Verify domain now" })).toBeEnabled();
		expect(azure.domainVerified).toBe(false);
		expect(azure.domainPrimary).toBe(false);
		expect(azure.dnsZoneExists).toBe(true);
		expect(azure.dnsTxtExists).toBe(true);
		expect(azure.adminConsentGranted).toBe(true);
		expect(prepared.github.variables.DNS).toBe(domainName);
		expect(prepared.github.variables.CORE_RESOURCE_GROUP).toBe("zbcore-pwtests-rg");
		expect(dnsZoneQueries.length).toBeGreaterThan(0);
		await expect(card.getByText("CORE_RESOURCE_GROUP", { exact: true })).toHaveCount(0);
		await expectSnapshot(page, card, testInfo, "end", viewportName);
	});

	await test.step("Retry verification after simulated DNS propagation", async () => {
		await card.getByRole("button", { name: "Verify domain now" }).click();
		await expect(card.getByText("Verification did not complete — DNS may still be propagating. Try again shortly.", { exact: true })).toBeVisible();
		expect(azure.domainVerified).toBe(false);
		expect(azure.domainPrimary).toBe(false);
		expect(getDomainVerificationAttempts()).toBe(1);

		await card.getByRole("button", { name: "Verify domain now" }).click();
		await expect(card.getByText(new RegExp(`Domain ${domainName} is verified and set as the primary domain\\.`))).toBeVisible();
		expect(azure.domainVerified).toBe(true);
		expect(azure.domainPrimary).toBe(true);
		expect(getDomainVerificationAttempts()).toBe(2);
		expect(txtRecordWrites).toHaveLength(1);
		expect(JSON.stringify(txtRecordWrites[0])).toContain("MS=ms12345678");
		await expectSnapshot(page, card, testInfo, "verified", viewportName);
	});

	await test.step("Read back verified status after reload", async () => {
		await page.reload();
		await openDomainCard(card);
		await expect(card.getByText(new RegExp(`Domain ${domainName} is verified and set as the primary domain\\.`))).toBeVisible();
		await expect(card.getByRole("button", { name: "Verify domain now" })).toHaveCount(0);
		expect(azure.domainVerified).toBe(true);
		expect(azure.domainPrimary).toBe(true);
		await expectSnapshot(page, card, testInfo, "verified-persisted", viewportName);
	});
}

async function openDomainCard(card: import("@playwright/test").Locator) {
	const header = card.getByRole("button", { name: /^Core domain/ });
	await expect(header).toBeVisible();
	if ((await header.getAttribute("aria-expanded")) !== "true") {
		await header.click();
	}
	await expect(header).toHaveAttribute("aria-expanded", "true");
	await expect(card.getByText(/Creates the DNS zone for/i)).toBeVisible();
}

async function prepareDomainCard(
	page: import("@playwright/test").Page,
	context: import("@playwright/test").BrowserContext,
	viewportName: string,
	options: DomainMockOptions = {},
) {
	const repoName = safePathSegment(`mock-create-domain-${viewportName.toLowerCase()}`);
	const unexpectedRequests: string[] = [];
	await context.route("**/*", async (route) => {
		if (new URL(route.request().url()).origin === new URL(CORP_URL).origin) {
			return route.continue();
		}
		unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
		await route.abort("blockedbyclient");
	});
	await context.route("https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json", (route) =>
		route.fulfill({ json: { enabled: false } }),
	);
	await context.route("https://australiaeast-1.in.applicationinsights.azure.com/v2/track", (route) =>
		route.fulfill({ status: 200, json: { itemsReceived: 0, itemsAccepted: 0, errors: [] } }),
	);

	const github = await installMockGitHub(page, context, {
		repositoryName: repoName,
		branches: ["main", "PROD"],
		initialVariables: {
			NAME: companyShortCode,
			AZURE_TENANT_ID: mockTenantId,
			AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
			VITE_AZURE_TENANT_ID: mockTenantId,
			AZURE_CLIENT_ID: mockClientId,
			AZURE_PLAN_CLIENT_ID: mockClientId,
			TF_STATE_RESOURCE_GROUP: "zbcore-pwtests-rg",
			TF_STATE_STORAGE_ACCOUNT: "zbcorepwtestsstor",
			TF_STATE_CONTAINER: "terraformstate",
			...(options.savedDomain ? { DNS: domainName, CORE_RESOURCE_GROUP: "zbcore-pwtests-rg" } : {}),
		},
	});
	await installMockAzure(page, {
		appDisplayName: "zeninstaller-mock-create-domain",
		servicePrincipalCreated: true,
		rbacAssigned: true,
	});

	const azure = await installCreateDomainAzureMock(page, domainName, options.initialAzureState);
	const infrastructure = await installCoreInfraAzureMock(page);
	infrastructure.createdResources.add("resource-group");
	infrastructure.roleAssignments.set(`/subscriptions/${mockSubscriptionId}/resourcegroups/zbcore-${companyShortCode}-rg`,
		new Set(["acdd72a7-3385-48ef-bd42-f606fba81ae7"]));
	let dnsZoneCreateAttempts = 0;
	let domainVerificationAttempts = 0;
	const txtRecordWrites: unknown[] = [];
	const resourceWrites: Array<{ path: string; body: unknown }> = [];
	const dnsZoneQueries: string[] = [];
	const adminConsentWrites: unknown[] = [];
	await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname.toLowerCase();
		if (request.method() === "GET" && path === `/subscriptions/${mockSubscriptionId}/providers/microsoft.network/dnszones`) {
			dnsZoneQueries.push(request.url());
		}
		if (request.method() === "PUT") resourceWrites.push({ path, body: request.postDataJSON() });
		if (request.method() === "PUT" && path.endsWith(`/dnszones/${domainName.toLowerCase()}`)) {
			dnsZoneCreateAttempts += 1;
			if (dnsZoneCreateAttempts <= (options.failDnsZoneCreates ?? 0)) {
				return route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ error: { code: "ServiceUnavailable", message: "Temporary DNS-zone failure" } }),
				});
			}
		}
		if (request.method() === "PUT" && path.endsWith(`/dnszones/${domainName.toLowerCase()}/txt/@`)) {
			txtRecordWrites.push(request.postDataJSON());
		}
		return route.fallback();
	});
	await page.route(`${MICROSOFT_GRAPH_URL}/**`, async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (request.method() === "POST" && path.endsWith("/appRoleAssignments")) {
			adminConsentWrites.push(request.postDataJSON());
		}
		if (options.failDomainStatusCheck && request.method() === "GET" && path === `/v1.0/domains/${domainName}`) {
			return route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ error: { code: "ServiceUnavailable", message: "Temporary domain-status failure" } }),
			});
		}
		if (request.method() === "POST" && path === `/v1.0/domains/${domainName}/verify`) {
			domainVerificationAttempts += 1;
			if (domainVerificationAttempts <= (options.delayDomainVerificationAttempts ?? 0)) {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ id: domainName, isVerified: false, isDefault: false }),
				});
			}
		}
		return route.fallback();
	});

	await page.route("**/msal.ts*", (route) =>
		route.fulfill({ contentType: "application/javascript", body: authenticationModule(options.rejectConsent ?? false) }),
	);
	await context.addInitScript(({ clientId, tenantId, corpName, dnsName, subscriptionId, domainStatus }) => {
		localStorage.setItem("zeninstaller_azure_result", JSON.stringify({
			clientId,
			tenantId,
			subscriptionIds: [subscriptionId],
		}));
		localStorage.setItem("zeninstaller_infra_result", JSON.stringify({
			corpName,
			subscriptionId,
			storageAccountName: "zbcorepwtestsstor",
			stateResourceGroup: "zbcore-pwtests-rg",
		}));
		if (domainStatus && !localStorage.getItem("zeninstaller_create_domain_result")) {
			localStorage.setItem("zeninstaller_create_domain_result", JSON.stringify({
				corpName,
				dnsName,
				subscriptionId,
				nameServers: ["ns1.mock.azure-dns.com.", "ns2.mock.azure-dns.net."],
				domainVerified: domainStatus.verified,
				isPrimary: domainStatus.primary,
			}));
		}
		sessionStorage.setItem("zeninstaller_arm_tenant", tenantId);
	}, {
		clientId: mockClientId,
		tenantId: mockTenantId,
		corpName: companyShortCode,
		dnsName: domainName,
		subscriptionId: mockSubscriptionId,
		domainStatus: options.persistedDomainStatus ?? null,
	});
	const url = new URL(CORP_URL);
	url.search = new URLSearchParams({
		account: "mock-user",
		repo: repoName,
		env: "PROD",
		tenant: mockTenantId,
		subscription: mockSubscriptionId,
	}).toString();
	await page.goto(url.toString());
	const card = page.locator("#card-create_domain");
	await openDomainCard(card);
	await expect(card.getByRole("textbox")).toBeVisible();
	return {
		card,
		prepared: { github },
		azure,
		infrastructure,
		unexpectedRequests,
		txtRecordWrites,
		resourceWrites,
		dnsZoneQueries,
		adminConsentWrites,
		getDnsZoneCreateAttempts: () => dnsZoneCreateAttempts,
		getDomainVerificationAttempts: () => domainVerificationAttempts,
	};
}
