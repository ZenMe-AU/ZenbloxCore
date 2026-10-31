/// <reference types="node" />
// UI component: ../../../corp-src/cards/RemoteTerminalInfra/RemoteTerminalInfraCard.tsx
import { expect, test } from "@playwright/test";
import { viewports } from "../../../../../.playwright/viewportFixture.mjs";
import { CORP_URL } from "../../testInit";
import { expectSnapshot } from "../../../../../.playwright/testHelper.js";
import { expectSuccessfulSteps } from "../util/mockTestHelper.mts";
import {
	connectionInput,
	backendResourceGroup,
	openConnectionDetails,
	openRemoteTerminalCard,
	prepareExistingRelayRepository,
	remoteTerminalStepLabels,
} from "../util/RemoteTerminalInfraCardHelper.mts";

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Remote Terminal Infrastructure Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1 });

		test("Happy path", async ({ page, context }, testInfo) => {
			test.setTimeout(1_200_000);
			const { card, names, tenantId } = await prepareExistingRelayRepository(page, context, viewportName);
			await expectSnapshot(page, card, testInfo, "start", viewportName);

			await test.step("Create the backend in the existing repository environment", async () => {
				const create = card.getByRole("button", { name: /^(?:Create backend environment|Re-run)$/ });
				await expect(create).toBeEnabled();
				await create.click();
				await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 600_000 });
				await expectSuccessfulSteps(card, remoteTerminalStepLabels(names));
				await openConnectionDetails(card);
				await expect(connectionInput(card, "WEBPUBSUB_ENDPOINT")).toHaveValue(`${names.webPubSub}.webpubsub.azure.com`);
				await expect(connectionInput(card, "VITE_API_URL")).toHaveValue(`https://${names.functionApp}.azurewebsites.net`);
				await expect(card.getByRole("textbox", { name: "Backend Storage Account", exact: true })).toHaveCount(0);
				await expect(card.getByRole("textbox", { name: "Sign-in App Client ID", exact: true })).toHaveCount(0);
				await expect(connectionInput(card, "WEBPUBSUB_TENANT_ID")).toHaveValue(tenantId);
				await expect(connectionInput(card, "WEBPUBSUB_CLIENT_ID")).toHaveValue(/^[0-9a-f-]{36}$/i);
				await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
				await expect(card.getByText(/\d+ not configured|Failed to/i)).toHaveCount(0);
				await expectSnapshot(page, card, testInfo, "created", viewportName);
			});

			const clientId = await connectionInput(card, "WEBPUBSUB_CLIENT_ID").inputValue();
			await test.step("Reload and read saved connection details", async () => {
				await page.reload();
				await openRemoteTerminalCard(page);
				await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled();
				await expect(card.getByText(`Resource group: ${backendResourceGroup}`, { exact: true })).toBeVisible();
				await openConnectionDetails(card);
				await expect(connectionInput(card, "WEBPUBSUB_CLIENT_ID")).toHaveValue(clientId);
				await expect(connectionInput(card, "WEBPUBSUB_TENANT_ID")).toHaveValue(tenantId);
				await expect(connectionInput(card, "WEBPUBSUB_ENDPOINT")).toHaveValue(`${names.webPubSub}.webpubsub.azure.com`);
				await expect(connectionInput(card, "VITE_API_URL")).toHaveValue(`https://${names.functionApp}.azurewebsites.net`);
				await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled();
				await expectSnapshot(page, card, testInfo, "persisted", viewportName);
			});

			await test.step("Re-run setup without replacing the pipeline identity", async () => {
				await card.getByRole("button", { name: "Re-run", exact: true }).click();
				await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled({ timeout: 600_000 });
				await expectSuccessfulSteps(card, remoteTerminalStepLabels(names));
				await expect(connectionInput(card, "WEBPUBSUB_CLIENT_ID")).toHaveValue(clientId);
				await expect(card.getByRole("button", { name: /^Save variables?$/ })).toBeDisabled({ timeout: 60_000 });
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
				await expectSnapshot(page, card, testInfo, "end", viewportName);
			});
		});

		test("Requires authentication before creating relay resources", async ({ page }, testInfo) => {
			await page.goto(CORP_URL);
			const card = page.locator("#card-remote_terminal_infra");
			await card.getByRole("button", { name: /^Private Zeninstaller Backend Environment/ }).click();
			await expect(card.getByText("Sign in to Azure", { exact: true })).toBeVisible();
			await expect(card.getByRole("button", { name: /Create backend environment|Re-run/ })).toHaveCount(0);
			await expectSnapshot(page, card, testInfo, "authentication-required", viewportName);
		});
	});
}