/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoreInfraCard, useHostingInventory, type HostingInventory } from "../cards/CoreInfra/useCoreInfraCard";
import { AzureHttpError } from "../api/azureFetch";
import type { AzureAccount } from "../types";

const arm = vi.hoisted(() => {
  const exists = () => vi.fn().mockResolvedValue("exists");
  return {
    ensureResourceGroup: exists(),
    resourceGroupExists: vi.fn().mockResolvedValue(true),
    ensureLogAnalyticsWorkspace: vi.fn(async (...args: unknown[]) => ({ result: "exists", id: `/law/${String(args[3])}` })),
    ensureSubscriptionDiagnostics: exists(),
    ensureStorageAccount: exists(),
    ensureStorageContainer: exists(),
    ensureDeleteLock: exists(),
    ensureBlobDiagnostics: exists(),
    findStorageAccountGroup: vi.fn().mockResolvedValue(null),
    storageAccountNameAvailable: vi.fn().mockResolvedValue(true),
    ensureRbacRoleAtScope: exists(),
    hasRbacRoleAtScope: vi.fn().mockResolvedValue(true),
    listLocations: vi.fn().mockResolvedValue([]),
    ensureDnsZone: vi.fn().mockResolvedValue({ result: "exists", nameServers: ["ns1.example"] }),
    ensureDnsTxtRecord: exists(),
    findDnsZone: vi.fn().mockResolvedValue(null),
    ensureBlobServiceProperties: vi.fn().mockResolvedValue(undefined),
    getStaticWebsiteUrl: vi.fn().mockResolvedValue("https://site.example/"),
    ensureAppInsights: exists(),
    getAppInsightsConnectionString: vi.fn().mockResolvedValue("InstrumentationKey=x"),
    ensureFlexServicePlan: exists(),
    ensureFlexFunctionApp: vi.fn().mockResolvedValue({ result: "exists", principalId: "app-principal" }),
    findFunctionAppGroup: vi.fn().mockResolvedValue(null),
    functionAppNameAvailable: vi.fn().mockResolvedValue(true),
    findWebPubSubGroup: vi.fn().mockResolvedValue(null),
    webPubSubNameAvailable: vi.fn().mockResolvedValue(true),
    ensureStorageTable: exists(),
    ensureWebPubSub: exists(),
    ensureWebPubSubHub: exists(),
    armExists: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("../api/azureArm", async (importOriginal) => ({ ...(await importOriginal<object>()), ...arm }));
vi.mock("../api/azureGraph", () => ({
  getExistingSP: vi.fn().mockResolvedValue({ id: "sp-object" }),
  getEntraDomain: vi.fn().mockResolvedValue({ isVerified: true }),
  createEntraDomain: vi.fn(),
  getDomainVerificationTxt: vi.fn(),
  grantAdminConsent: vi.fn(),
  listAppRoleAssignments: vi.fn().mockResolvedValue(["7e05723c-0bb0-42da-be95-ae9f08a6e53c"]),
  createSpaAppRegistration: vi.fn(),
  createServicePrincipal: vi.fn(),
  ensureSpaRedirectUri: vi.fn().mockResolvedValue(false),
  getExistingApp: vi.fn().mockResolvedValue({ id: "app-object", appId: "app-id" }),
  createAppRegistration: vi.fn(),
  ensureFederatedCredential: vi.fn().mockResolvedValue(false),
}));
vi.mock("../auth/msal", () => ({ ensureScopeConsent: vi.fn().mockResolvedValue(false), getMsal: vi.fn(), getToken: vi.fn() }));
vi.mock("../hooks/util/useProviderRegistration", () => ({ useProviderRegistration: () => ({ ensureRegistered: async () => ({ registered: [] }) }) }));
vi.mock("../hooks/util/useAzureCardAccess", () => ({
  useCardResourceAccess: () => ({ status: "ready", check: async () => {}, reportFailure: vi.fn(), retry: vi.fn() }),
}));

const account = { tenantId: "tenant", localAccountId: "me", homeAccountId: "home" } as AzureAccount;
const github = { login: "org", id: 1, type: "Organization" as const };

// The card hook itself, with the runner under the name the tests read.
function useHosting() {
  const card = useCoreInfraCard({
    azureAccount: account, subscriptionId: "sub", tenantId: "tenant", corpName: "acme", dnsName: "acme.com", spClientId: "client", variableValues: {},
    appOrigin: "https://installer.example", githubAccount: github, githubRepo: "repo", githubRepoId: 2, githubEnvName: "TEST",
  });
  return { ...card, hosting: card.provisioning };
}

let latest: ReturnType<typeof useHosting>;
let root: Root;
function Harness({ onUpdate }: { onUpdate: (value: ReturnType<typeof useHosting>) => void }) {
  onUpdate(useHosting());
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness onUpdate={(value) => { latest = value; }} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe("private hosting environment as one task graph", () => {
  it("maps all 39 steps onto unique tasks, sharing each group, workspace and the subscription diagnostic setting", () => {
    const { plan } = latest.hosting;
    expect(plan.stages.map((stage) => [stage.label, stage.steps.length])).toEqual([
      ["Core infrastructure", 9],
      ["DNS & custom domain", 5],
      ["Frontend hosting", 10],
      ["Backend infrastructure", 15],
    ]);
    // 39 steps (the access check, permissions and provider registration are turned off), minus a second core group, workspace and subscription diagnostic setting, minus a second private group and workspace.
    expect(plan.tasks.size).toBe(34);
    const shared = [...plan.tasks.values()].filter((task) => task.stageIds.length > 1).map((task) => [task.label, task.stageIds]);
    expect(shared).toEqual([
      ["Create resource group zbcore-acme-rg", ["core_infra", "create_domain"]],
      ["Create Log Analytics workspace zbcore-acme-law", ["core_infra", "create_domain"]],
      ["Configure subscription activity-log diagnostics", ["core_infra", "private_frontend_infra"]],
      ["Create resource group zeninstaller-private-rg", ["private_frontend_infra", "remote_terminal_infra"]],
      ["Create Log Analytics workspace zeninstaller-private-law", ["private_frontend_infra", "remote_terminal_infra"]],
    ]);
    // The Function App's settings name the Web PubSub host and are only written on creation.
    expect(plan.tasks.get("remote_terminal_infra:app")!.dependsOn).toContain("remote_terminal_infra:wps");
  });

  it("creates shared resources once, and a Web PubSub name conflict reruns only what depends on it", async () => {
    arm.ensureWebPubSub.mockRejectedValueOnce(new AzureHttpError(409, '409 /webPubSub/zeninstaller-private-wpubsub: {"code":"NameNotAvailable"}'));
    await act(async () => {
      await latest.hosting.run(true);
    });
    const { state } = latest.hosting;
    expect(arm.ensureResourceGroup).toHaveBeenCalledTimes(2);
    expect(arm.ensureLogAnalyticsWorkspace).toHaveBeenCalledTimes(2);
    // Written once, to the core workspace.
    expect(arm.ensureSubscriptionDiagnostics).toHaveBeenCalledTimes(1);
    expect(arm.ensureSubscriptionDiagnostics).toHaveBeenCalledWith(account, "sub", "standard-diagnostics-setting", "/law/zbcore-acme-law", "tenant");
    expect(state["remote_terminal_infra:wps"]).toMatchObject({ status: "action_required", error: { kind: "name_conflict" } });
    for (const blocked of ["hub", "app", "rbac", "pipelineRbac"]) expect(state[`remote_terminal_infra:${blocked}`].status).toBe("blocked");
    // Unrelated work finished.
    expect(state["remote_terminal_infra:storage"].status).toBe("skipped");
    expect(state["core_infra:rbac"].status).toBe("skipped");
    const storageCalls = arm.ensureStorageAccount.mock.calls.length;
    const oldName = latest.backend.webPubSub.name;

    await act(async () => latest.backend.webPubSub.apply(`${oldName}x`));
    await act(async () => {
      await latest.hosting.retry(["remote_terminal_infra:wps"]);
    });
    expect(arm.ensureWebPubSub).toHaveBeenLastCalledWith(account, "sub", "zeninstaller-private-rg", `${oldName}x`, "australiaeast", "Free_F1", "tenant");
    expect(arm.ensureStorageAccount).toHaveBeenCalledTimes(storageCalls);
    expect(arm.ensureResourceGroup).toHaveBeenCalledTimes(2);
    expect(latest.hosting.state["remote_terminal_infra:app"].status).toBe("skipped");
    // The finished part saves the new name, which the connection details then write to GitHub.
    expect(latest.backend.result?.webPubSubHost).toBe(`${oldName}x.webpubsub.azure.com`);
    expect(latest.hosting.progress).toMatchObject({ total: 34, settled: 34 });
  });
});

describe("hosting inventory", () => {
  it("reads each resource back from Azure, keeping unknown apart from missing", async () => {
    arm.findStorageAccountGroup.mockImplementation(async (...args: unknown[]) => (args[2] === "site" ? "elsewhere-rg" : null));
    arm.findWebPubSubGroup.mockResolvedValueOnce("zeninstaller-private-rg");
    arm.findFunctionAppGroup.mockRejectedValueOnce(new AzureHttpError(403, "403 /subscriptions/sub/providers/Microsoft.Web/sites: AuthorizationFailed"));
    arm.findDnsZone.mockResolvedValueOnce(null);
    const names = {
      coreGroup: "zbcore-acme-rg", coreWorkspace: "zbcore-acme-law", stateStorage: "state", stateContainer: "terraformstate", dnsName: "acme.com",
      privateGroup: "zeninstaller-private-rg", privateWorkspace: "zeninstaller-private-law", appInsights: "zeninstaller-private-appins",
      siteStorage: "site", apiStorage: "api", webPubSub: "wps", functionApp: "app",
    };
    let inventory: HostingInventory | null = null;
    let current = names;
    function Inventory({ resourceNames }: { resourceNames: typeof names }) {
      const found = useHostingInventory({ azureAccount: account, subscriptionId: "sub", tenantId: "tenant" }, resourceNames, 0);
      useEffect(() => {
        inventory = found;
      });
      return null;
    }
    const inventoryRoot = createRoot(document.createElement("div"));
    await act(async () => inventoryRoot.render(<Inventory resourceNames={current} />));
    await vi.waitFor(() => expect(inventory?.pending.size).toBe(0));
    expect(inventory).toMatchObject({
      coreGroup: true, coreWorkspace: true, stateStorageGroup: null, stateContainer: false, dnsZone: false, customDomain: true,
      privateGroup: true, privateWorkspace: true, appInsights: true, siteStorageGroup: "elsewhere-rg", apiStorageGroup: null, webPubSubGroup: "zeninstaller-private-rg",
    });
    // A lookup that could not run is unknown, so the saved result still counts for that row.
    expect(inventory!.functionAppGroup).toBeUndefined();

    // A new site storage name looks up only the site storage account; every other row keeps its answer.
    const functionAppLookups = arm.findFunctionAppGroup.mock.calls.length;
    const storageLookups = arm.findStorageAccountGroup.mock.calls.length;
    current = { ...names, siteStorage: "site2" };
    await act(async () => inventoryRoot.render(<Inventory resourceNames={current} />));
    await vi.waitFor(() => expect(inventory?.pending.size).toBe(0));
    expect(inventory).toMatchObject({ webPubSubGroup: "zeninstaller-private-rg", coreGroup: true });
    expect(arm.findFunctionAppGroup).toHaveBeenCalledTimes(functionAppLookups);
    expect(arm.findStorageAccountGroup).toHaveBeenCalledTimes(storageLookups + 1);
    expect(inventory!.siteStorageGroup).toBeNull();
    await act(async () => inventoryRoot.unmount());
  });
});
