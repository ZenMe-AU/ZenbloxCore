/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/PrivateFrontendInfra/PrivateFrontendInfraCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { test, getViewportName } from "../util/viewportFixture.mts";
import { expectSnapshot } from "../../util/testHelper.ts";
import { AZURE_MANAGEMENT_URL, MICROSOFT_GRAPH_URL, CORP_URL } from "../../testInit";
import { expectSuccessfulSteps } from "../util/mockTestHelper.mts";
import { prepareCardMocks, privateGroup, replyJson, siteStorage, siteUrl, storageId, storageResource } from "../util/mockCardSetup.mts";

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Does not save connection details after storage configuration fails", async ({ page, context }, testInfo) => {
  const { card, state, github, unexpectedRequests } = await prepareFrontend(page, context, { denyBlob: true });
  await expect(card.getByRole("button", { name: "Create terminal relay", exact: true })).toBeEnabled();
  await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
  await expect(card.getByText(/Mock storage configuration denied/)).toBeVisible();
  expect(state.appCreated).toBe(false);
  expect(github.variables.VITE_AZURE_CLIENT_ID).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem("zeninstaller_private_env_result"))).toBeNull();
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "storage-denied", getViewportName(testInfo));
});

test("Derives completion from existing Azure resources and saved variables", async ({ page, context }, testInfo) => {
  const setup = await prepareCardMocks(page, context, {}, { frontend: true });
  const card = await setup.open("private_frontend_infra");
  await expect(card.locator("h3")).toContainText("Complete");
  await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("zeninstaller_private_env_result"))).toBeNull();
  expect(setup.unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "existing-environment", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo) {
  const { card, state, github, unexpectedRequests } = await prepareFrontend(page, context);
  const viewport = getViewportName(testInfo);
  await test.step("Create the hosting environment from seeded Azure prerequisites", async () => {
    await expect(card.getByRole("button", { name: "Create terminal relay", exact: true })).toBeEnabled();
    await expect(card.getByText("Australia East", { exact: true })).toBeVisible();
    await expectSnapshot(page, card, testInfo, "start", viewport);
    await card.getByRole("button", { name: "Create terminal relay", exact: true }).click();
    await expect(card.getByRole("button", { name: "Re-run", exact: true })).toBeEnabled();
    await expectSuccessfulSteps(card, [
      "Register required Azure resource providers",
      "Create resource group zeninstaller-private-rg",
      "Create Log Analytics workspace zeninstaller-private-law",
      `Create storage account ${siteStorage}`,
      "Enable static website hosting and reach the blob service",
      "Consent to the storage data plane",
      "Grant yourself Storage Blob Data Contributor on it",
      "Send activity and blob writes to the workspace",
      "Create app registration Zeninstaller Private",
      "List Zeninstaller Private under enterprise applications",
    ]);
    expect(state.resources.has(storageId.toLowerCase())).toBe(true);
    expect(state.appCreated).toBe(true);
    expect(state.spCreated).toBe(true);
    expect(state.blobProperties).toMatchObject({
      properties: {
        staticWebsite: { enabled: true, indexDocument: "index.html", errorDocument404Path: "index.html" },
        cors: { corsRules: [{ allowedOrigins: [new URL(CORP_URL).origin] }] },
      },
    });
    await expectSnapshot(page, card, testInfo, "hosting-created", viewport);
  });
  await test.step("Save and read back the site's connection details", async () => {
    await expect.poll(() => github.variables.VITE_AZURE_CLIENT_ID).toBe("mock-private-client");
    expect(github.variables.SITE_STORAGE_ACCOUNT).toBe(siteStorage);
    await expect(card.locator("h3")).toContainText("Complete");
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, "end", viewport);
  });
}

async function prepareFrontend(page: Page, context: BrowserContext, options: { denyBlob?: boolean } = {}) {
  const setup = await prepareCardMocks(page, context);
  const state = {
    resources: new Set<string>(),
    appCreated: false,
    spCreated: false,
    blobProperties: null as unknown,
  };
  await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.toLowerCase();
    const method = request.method();
    if (path.includes("/providers/microsoft.web/") || path.includes("/providers/microsoft.signalrservice/")) return route.fallback();
    if (/\/providers\/microsoft\.(storage|insights|operationalinsights|signalrservice|web)$/.test(path) && method === "GET") {
      return replyJson(route, { registrationState: "Registered" });
    }
    if (path.endsWith("/providers/microsoft.storage/storageaccounts") && method === "GET") {
      return replyJson(route, { value: state.resources.has(storageId.toLowerCase()) ? [storageResource()] : [] });
    }
    if (path.endsWith("/checknameavailability") && method === "POST") {
      expect(request.postDataJSON()).toEqual({ name: siteStorage, type: "Microsoft.Storage/storageAccounts" });
      return replyJson(route, { nameAvailable: true });
    }
    const ownResource =
      path.startsWith(privateGroup.toLowerCase()) || path.endsWith("/providers/microsoft.insights/diagnosticsettings/standard-diagnostics-setting");
    if (!ownResource) return route.fallback();
    if (path.endsWith("/roleassignments") && method === "GET") return replyJson(route, { value: [] });
    if (method === "GET") {
      return replyJson(route, { id: path, properties: { provisioningState: "Succeeded" } }, state.resources.has(path) ? 200 : 404);
    }
    if (method !== "PUT") throw new Error(`Unexpected hosting request: ${method} ${path}`);
    if (path.endsWith("/blobservices/default")) {
      state.blobProperties = request.postDataJSON();
      if (options.denyBlob) return replyJson(route, { error: { message: "Mock storage configuration denied" } }, 403);
    }
    if (path === privateGroup.toLowerCase()) expect(request.postDataJSON()).toEqual({ location: "australiaeast" });
    if (path === storageId.toLowerCase())
      expect(request.postDataJSON()).toEqual({
        location: "australiaeast",
        sku: { name: "Standard_LRS" },
        kind: "StorageV2",
      });
    if (path.includes("/roleassignments/"))
      expect(request.postDataJSON()).toMatchObject({
        properties: {
          principalId: "mock-user",
          principalType: "User",
          roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe",
        },
      });
    state.resources.add(path);
    return replyJson(route, { id: path, properties: { provisioningState: "Succeeded" } });
  });
  await page.route(`${MICROSOFT_GRAPH_URL}/v1.0/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/v1.0/servicePrincipals" && url.searchParams.get("$select") === "oauth2PermissionScopes") {
      const scopes = url.searchParams.get("$filter")?.includes("00000003-0000-0000-c000-000000000000")
        ? ["User.Read", "Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All", "Application.Read.All", "Domain.ReadWrite.All"]
        : ["user_impersonation"];
      return replyJson(route, {
        value: [
          {
            oauth2PermissionScopes: scopes.map((value, i) => ({
              value,
              id: `00000000-0000-0000-0000-${String(i + 10).padStart(12, "0")}`,
            })),
          },
        ],
      });
    }
    if (path === "/v1.0/applications" && request.method() === "GET" && url.searchParams.get("$filter") === "displayName eq 'Zeninstaller Private'") {
      return replyJson(route, { value: state.appCreated ? [{ appId: "mock-private-client", id: "mock-private-object" }] : [] });
    }
    if (path === "/v1.0/applications" && request.method() === "POST") {
      expect(request.postDataJSON()).toMatchObject({ displayName: "Zeninstaller Private", spa: { redirectUris: [siteUrl] } });
      state.appCreated = true;
      return replyJson(route, { appId: "mock-private-client", id: "mock-private-object" }, 201);
    }
    if (path === "/v1.0/servicePrincipals" && url.searchParams.get("$filter") === "appId eq 'mock-private-client'") {
      return replyJson(route, { value: state.spCreated ? [{ id: "mock-private-sp" }] : [] });
    }
    if (path === "/v1.0/servicePrincipals" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ appId: "mock-private-client" });
      state.spCreated = true;
      return replyJson(route, { id: "mock-private-sp" }, 201);
    }
    return route.fallback();
  });
  const card = await setup.open("private_frontend_infra");
  return { ...setup, card, state };
}
