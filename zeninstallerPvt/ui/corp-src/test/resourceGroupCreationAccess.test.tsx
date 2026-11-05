/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureResourceGroupCreationAccess } from "../api/azureArm";
import { ARM_SCOPES } from "../config/azureConfig";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import { useCoreInfraCard } from "../cards/CoreInfra/useCoreInfraCard";
import { useCreateDomainCard } from "../cards/CreateDomain/useCreateDomainCard";
import { usePrivateFrontendInfraCard } from "../cards/PrivateFrontendInfra/usePrivateFrontendInfraCard";
import { useRemoteTerminalInfraCard } from "../cards/RemoteTerminalInfra/useRemoteTerminalInfraCard";
import type { AzureAccount, SetupStep } from "../types";
import type { ResourceGroupCreationAccess } from "../hooks/util/useResourceGroupCreationAccess";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  azFetch: vi.fn(),
  ensureScopeConsent: vi.fn(),
  ensureRegistered: vi.fn(),
  ensureResourceGroup: vi.fn(),
}));

vi.mock("../auth/msal", () => ({
  getToken: mocks.getToken,
  ensureScopeConsent: mocks.ensureScopeConsent,
}));
vi.mock("../api/azureFetch", () => ({
  ARM: "https://management.azure.com",
  azFetch: mocks.azFetch,
}));
vi.mock("../hooks/util/useProviderRegistration", () => ({
  useProviderRegistration: () => ({ ensureRegistered: mocks.ensureRegistered }),
}));
vi.mock("../api/azureArm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/azureArm")>()),
  ensureResourceGroup: mocks.ensureResourceGroup,
  resourceGroupExists: vi.fn().mockResolvedValue(false),
  listLocations: vi.fn().mockResolvedValue([]),
  findStorageAccountGroup: vi.fn().mockResolvedValue(null),
  findDnsZone: vi.fn().mockResolvedValue(null),
}));
vi.mock("../api/azureGraph", () => ({
  getExistingSP: vi.fn().mockResolvedValue(null),
  getEntraDomain: vi.fn().mockResolvedValue(null),
  listVerifiedDomains: vi.fn().mockResolvedValue([]),
}));

const account = { tenantId: "tenant-1", username: "installer" } as AzureAccount;
const writeAction = "Microsoft.Resources/subscriptions/resourceGroups/write";
const permissionsPath = "/subscriptions/sub-1/providers/Microsoft.Authorization/permissions?api-version=2022-04-01";
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getToken.mockResolvedValue("arm-token");
  mocks.azFetch.mockReset().mockResolvedValue({ value: [] });
  mocks.ensureScopeConsent.mockResolvedValue(false);
  mocks.ensureRegistered.mockRejectedValue(new Error("Provider registration stopped for test"));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

describe("subscription resource-group creation permissions", () => {
  it.each(["*", "Microsoft.Resources/*", writeAction.toUpperCase(), "Microsoft.Resources/subscriptions/*/write"])(
    "accepts effective permission %s",
    async (action) => {
      mocks.azFetch.mockResolvedValue({ value: [{ actions: [action], notActions: [] }] });
      await expect(ensureResourceGroupCreationAccess(account, "sub-1", "target-tenant")).resolves.toBeUndefined();
      expect(mocks.getToken).toHaveBeenCalledWith(account, ARM_SCOPES, "target-tenant");
      expect(mocks.azFetch).toHaveBeenCalledWith("arm-token", "https://management.azure.com", permissionsPath);
    }
  );

  it.each([
    [],
    [{ actions: ["*/read"], notActions: [] }],
    [{ actions: ["*"], notActions: [writeAction] }],
    [{ actions: ["*"], notActions: ["Microsoft.Resources/*"] }],
    [{ actions: ["MicrosoftXResources/*"], notActions: [] }],
    [{ actions: [], dataActions: ["*"] }],
  ].map((value) => ({ value })))("rejects permissions without subscription resource-group write access: $value", async ({ value }) => {
    mocks.azFetch.mockResolvedValue({ value });
    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow(
      /Contributor access.*selected subscription sub-1.*individual resource group is not sufficient/s
    );
  });

  it("allows another grant to restore an action excluded by NotActions", async () => {
    mocks.azFetch.mockResolvedValue({
      value: [{ actions: ["*"], notActions: [writeAction] }, { actions: [writeAction] }],
    });

    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).resolves.toBeUndefined();
  });

  it("includes the PIM activation link when access is denied or cannot be verified", async () => {
    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow(AZURE_PIM_ACTIVATION_URL);
    mocks.azFetch.mockRejectedValueOnce(new Error("403 AuthorizationFailed"));
    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow(AZURE_PIM_ACTIVATION_URL);
  });

  it("follows permission pages before rejecting access", async () => {
    mocks.azFetch
      .mockResolvedValueOnce({ value: [], nextLink: `https://management.azure.com${permissionsPath}&$skiptoken=next` })
      .mockResolvedValueOnce({ value: [{ actions: [writeAction] }] });
    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).resolves.toBeUndefined();
    expect(mocks.azFetch).toHaveBeenLastCalledWith("arm-token", "https://management.azure.com", `${permissionsPath}&$skiptoken=next`);
  });

  it.each(["403 AuthorizationFailed", "Network unavailable", "AADSTS65001 consent_required"])(
    "fails closed and preserves verification errors: %s",
    async (message) => {
      mocks.azFetch.mockRejectedValue(new Error(message));
      await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow(
        `Could not verify resource-group creation access. You need Contributor access`
      );
      await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow(message);
    }
  );

  it("does not mistake token acquisition failure for verified access", async () => {
    mocks.getToken.mockRejectedValueOnce(new Error("Sign in again"));
    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow("Sign in again");
    expect(mocks.azFetch).not.toHaveBeenCalled();
  });

  it("rejects a malformed permission response", async () => {
    mocks.azFetch.mockResolvedValue({});
    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow("invalid subscription permissions response");
  });

  it("never sends the ARM token to an unexpected pagination host", async () => {
    mocks.azFetch.mockResolvedValue({ value: [], nextLink: "https://unexpected.example/permissions" });
    await expect(ensureResourceGroupCreationAccess(account, "sub-1")).rejects.toThrow("unexpected subscription permissions URL");
    expect(mocks.azFetch).toHaveBeenCalledTimes(1);
  });
});

const cards = [
  { name: "Terraform state backend", useCard: useCoreInfraCard },
  { name: "Core domain", useCard: useCreateDomainCard },
  { name: "Frontend hosting environment", useCard: usePrivateFrontendInfraCard },
  { name: "Private Zeninstaller Backend Environment", useCard: useRemoteTerminalInfraCard },
];

describe.each(cards)("$name access preflight", ({ useCard }) => {
  const props = {
    azureAccount: account,
    subscriptionId: "sub-1",
    tenantId: "tenant-1",
    corpName: "Example",
    dnsName: "example.com",
    spClientId: "pipeline-client",
    variableValues: {},
    allowedOrigins: ["https://installer.example.com"],
    githubAccount: { login: "example", id: 1, type: "Organization" as const },
    githubRepo: "corp",
    githubRepoId: 2,
    githubEnvName: "TEST",
  };
  let latest: { run: () => Promise<void>; steps: SetupStep[]; running: boolean; creationAccess: ResourceGroupCreationAccess };

  async function mount(subscriptionId = props.subscriptionId) {
    function Harness() {
      latest = useCard({ ...props, subscriptionId });
      return null;
    }
    root ??= createRoot(document.createElement("div"));
    await act(async () => root!.render(<Harness />));
  }

  it("checks access before clicking create without starting setup", async () => {
    await mount();
    expect(latest.creationAccess).toMatchObject({
      status: "error",
      error: expect.stringContaining("Contributor access"),
    });
    expect(latest.steps).toEqual([]);
    expect(mocks.ensureResourceGroup).not.toHaveBeenCalled();
    expect(mocks.ensureRegistered).not.toHaveBeenCalled();
    expect(mocks.ensureScopeConsent).not.toHaveBeenCalled();
  });

  it("allows rechecking after PIM activation without clicking create", async () => {
    await mount();
    mocks.azFetch.mockResolvedValue({ value: [{ actions: ["*"] }] });
    await act(async () => latest.creationAccess.retry());
    expect(latest.creationAccess.status).toBe("ready");
    expect(latest.steps).toEqual([]);
    expect(mocks.ensureRegistered).not.toHaveBeenCalled();
  });

  it("blocks all setup writes and explains the subscription Contributor requirement", async () => {
    await mount();
    await act(async () => latest.run());
    expect(latest.steps[0]).toMatchObject({
      id: "access",
      status: "error",
      detail: expect.stringMatching(/Contributor access.*selected subscription sub-1/),
    });
    expect(latest.running).toBe(false);
    expect(mocks.ensureRegistered).not.toHaveBeenCalled();
    expect(mocks.ensureScopeConsent).not.toHaveBeenCalled();
    expect(mocks.ensureResourceGroup).not.toHaveBeenCalled();
  });

  it("shows failed verification instead of continuing or requesting Graph consent", async () => {
    mocks.azFetch.mockRejectedValue(new Error("AADSTS65001 consent_required"));
    await mount();
    await act(async () => latest.run());
    expect(latest.steps[0]).toMatchObject({
      id: "access",
      status: "error",
      detail: expect.stringContaining("Could not verify resource-group creation access"),
    });
    expect(mocks.ensureRegistered).not.toHaveBeenCalled();
    expect(mocks.ensureScopeConsent).not.toHaveBeenCalled();
    expect(mocks.ensureResourceGroup).not.toHaveBeenCalled();
  });

  it("rechecks on retry and allows setup after access is granted", async () => {
    await mount();
    await act(async () => latest.run());
    mocks.azFetch.mockResolvedValue({ value: [{ actions: ["*"] }] });
    await act(async () => latest.run());
    expect(latest.steps[0]).toMatchObject({ id: "access", status: "done" });
    expect(mocks.azFetch).toHaveBeenCalledTimes(3);
    expect(mocks.ensureRegistered).toHaveBeenCalledTimes(1);
    expect(mocks.azFetch.mock.invocationCallOrder[2]).toBeLessThan(mocks.ensureRegistered.mock.invocationCallOrder[0]);
  });

  it("checks the newly selected subscription instead of trusting an earlier result", async () => {
    mocks.azFetch.mockResolvedValue({ value: [{ actions: ["*"] }] });
    await mount();
    await act(async () => latest.run());
    mocks.azFetch.mockResolvedValue({ value: [] });
    await mount("sub-2");
    await act(async () => latest.run());
    expect(mocks.azFetch).toHaveBeenLastCalledWith(
      "arm-token",
      "https://management.azure.com",
      "/subscriptions/sub-2/providers/Microsoft.Authorization/permissions?api-version=2022-04-01"
    );
    expect(latest.steps[0]).toMatchObject({ status: "error", detail: expect.stringContaining("selected subscription sub-2") });
    expect(mocks.ensureRegistered).toHaveBeenCalledTimes(1);
  });
});
