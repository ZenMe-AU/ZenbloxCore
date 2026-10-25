import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { CORP_URL, SUBSCRIPTION_ID, TEST_REPO_MAIN } from "../../testInit";
import { safePathSegment } from "../../util/testHelper.ts";
import { expandAzureLoginCard, expandAzureSubscriptionCard, expandCard, expandRepoCard } from "./cardHelper.mts";
import { chooseExistingRepo } from "./testHelper.mts";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "./setupHelper.mts";

export const backendResourceGroup = "zeninstaller-private-rg";
export const backendLaw = "zeninstaller-private-law";
export const backendInsights = "zeninstaller-private-ai";
export const pipelineAppName = "zeninstaller-private-pipeline";
export const terminalKeys = [
	"WEBPUBSUB_ENDPOINT", "WEBPUBSUB_CLIENT_ID", "WEBPUBSUB_TENANT_ID",
	"VITE_API_URL", "VITE_APPINSIGHTS_CONNECTION_STRING",
] as const;
export type BackendNames = { storage: string; webPubSub: string; functionApp: string };

export function defaultBackendNames(subscriptionId: string): BackendNames {
	const suffix = subscriptionId.replace(/-/g, "").slice(0, 6).toLowerCase();
	return {
		storage: `zeninstallerpvtapi${suffix}`,
		webPubSub: `zeninstaller-private-wpubsub-${suffix}`,
		functionApp: `zeninstaller-private-app-${suffix}`,
	};
}

export async function openRemoteTerminalCard(page: Page) {
	const card = page.locator("#card-remote_terminal_infra");
	await expandCard(card);
	await expect(card.getByText(/The relay behind the stage-card terminal:/)).toBeVisible({ timeout: 60_000 });
	return card;
}

export function connectionInput(card: Locator, key: string) {
	const labels: Record<string, string> = {
		WEBPUBSUB_ENDPOINT: "Web PubSub Endpoint",
		WEBPUBSUB_CLIENT_ID: "Web PubSub Client ID",
		WEBPUBSUB_TENANT_ID: "Web PubSub Tenant ID",
		VITE_API_URL: "API URL",
		VITE_APPINSIGHTS_CONNECTION_STRING: "App Insights Connection String",
	};
	if (!labels[key]) throw new Error(`No visible backend connection field for ${key}`);
	return card.getByRole("textbox", { name: labels[key], exact: true });
}

export async function openConnectionDetails(card: Locator) {
	const toggle = card.getByRole("button", { name: /^(?:open to enter connection detail|collapse)$/ });
	if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
	await expect(toggle).toHaveAttribute("aria-expanded", "true");
	await expect(card.getByRole("region", { name: "Connection details", exact: true })).toBeVisible();
	await expect(card.getByRole("progressbar", { name: "Loading variables", exact: true })).toHaveCount(0, { timeout: 60_000 });
}

export function remoteTerminalStepLabels(names: BackendNames, environment = "PROD") {
	return [
		"Register required Azure resource providers",
		`Create resource group ${backendResourceGroup}`,
		`Create Log Analytics workspace ${backendLaw}`,
		`Create Application Insights ${backendInsights}`,
		`Create storage account ${names.storage}`,
		"Create sessions table",
		"Create deployment container",
		`Create Web PubSub ${names.webPubSub}`,
		"Configure hub terminal",
		"Create Flex Consumption plan",
		`Create Function App ${names.functionApp}`,
		"Grant the Function App its data-plane roles",
		`Create app registration ${pipelineAppName}`,
		`List ${pipelineAppName} under enterprise applications`,
		`Add GitHub OIDC credential for ${environment}`,
		"Grant it Web PubSub Service Owner",
	];
}

export async function prepareExistingRelayRepository(page: Page, context: BrowserContext, viewportName: string) {
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
	// Reuse the existing repository; backend provisioning does not depend on core infrastructure.
	await chooseExistingRepo(page, repoCard, repoName);
	await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
	const environment = repoCard.getByRole("button", { name: "PROD", exact: true });
	await environment.click();
	await expect(environment).toHaveAttribute("aria-pressed", "true");
	const subscriptionCard = await expandAzureSubscriptionCard(page);
	await expect(subscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden({ timeout: 60_000 });
	await subscriptionCard.getByRole("combobox").click();
	await page.getByRole("option").filter({ hasText: SUBSCRIPTION_ID }).click();
	await expect(subscriptionCard.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
	const subscriptionSave = subscriptionCard.getByRole("button", { name: /^Save\s+(?:\d+\s+)?variables?$/ });
	await expect(subscriptionSave).toBeVisible();
	if (await subscriptionSave.isEnabled()) await subscriptionSave.click();
	await expect(subscriptionCard.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
	const subscriptionInput = subscriptionCard.getByRole("textbox", { name: "AZURE_SUBSCRIPTION_ID", exact: true });
	const subscriptionId = (await subscriptionInput.inputValue()).trim();
	expect(subscriptionId, "The selected environment must have a saved AZURE_SUBSCRIPTION_ID").not.toBe("");
	expect(subscriptionId, "Saved AZURE_SUBSCRIPTION_ID must be an Azure subscription UUID, not a display name")
		.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

	const card = await openRemoteTerminalCard(page);
	await openConnectionDetails(card);
	const names = defaultBackendNames(subscriptionId);
	const endpoint = await connectionInput(card, "WEBPUBSUB_ENDPOINT").inputValue();
	const apiUrl = await connectionInput(card, "VITE_API_URL").inputValue();
	names.webPubSub = endpoint.replace(/\.webpubsub\.azure\.com\/?$/i, "") || names.webPubSub;
	names.functionApp = /^https:\/\/([^.]+)\.azurewebsites\.net/i.exec(apiUrl)?.[1] || names.functionApp;
	// The persisted storage name is deliberately absent from the connection table.
	await card.getByRole("button", { name: "Edit Storage account", exact: true }).click();
	names.storage = await card.getByRole("textbox", { name: "Storage account", exact: true }).inputValue();
	await card.getByRole("button", { name: "Confirm Storage account", exact: true }).click();
	await expect(card.getByRole("button", { name: "Edit Storage account", exact: true })).toBeVisible({ timeout: 60_000 });
	return { card, names, tenantId, repoName };
}
