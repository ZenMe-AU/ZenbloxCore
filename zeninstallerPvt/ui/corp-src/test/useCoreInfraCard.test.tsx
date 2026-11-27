/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePartRun, type PartRun } from "./hookTestUtils";
import { CoreEnvironmentSection } from "../cards/CoreInfra/CoreInfraCard";
import type { UseDomainPart } from "../cards/CoreInfra/useDomainPart";
import type { CardResourceAccess } from "../hooks/util/useAzureCardAccess";
import { useTerraformStatePart, type UseTerraformStatePart } from "../cards/CoreInfra/useTerraformStatePart";
import { hostingEnvironmentFace, useAzureLocations } from "../cards/CoreInfra/useCoreInfraCard";
import type { AzureAccount } from "../types";
import theme from "../theme";
import type { UseFrontendPart } from "../cards/CoreInfra/useFrontendPart";
import type { UseBackendPart } from "../cards/CoreInfra/useBackendPart";

// The private group's parts of the same section, with access in place, so only the core part under test shows its access.
const readyFrontend = { cardId: "private_frontend_infra", creationAccess: { status: "ready" } } as unknown as UseFrontendPart;
const readyBackend = { cardId: "remote_terminal_infra", creationAccess: { status: "ready" } } as unknown as UseBackendPart;

// The domain part of the same block, idle and with access in place, so only the state backend's access shows.
const idleDomain = {
  cardId: "create_domain", status: "warning", summary: "", done: false, steps: [], running: false, run: async () => true, reset: vi.fn(), runNonce: 0,
  creationAccess: { status: "ready", error: null, failureKind: null, retry: vi.fn(), check: vi.fn(), reportFailure: vi.fn(), missingRoles: null, missingEntra: null, unregisteredProviders: [], registeringProviders: false, registerProviders: async () => {}, missingConsent: [], grantConsent: vi.fn() } as CardResourceAccess, location: "australiaeast", setLocation: vi.fn(), resourceGroupName: "zbcore-zenblox-rg", lawName: "zbcore-zenblox-law",
  resourcesDone: false, nameServers: [], verifiedDomains: [], domainVerified: false, isPrimary: false, makePrimary: false, setMakePrimary: vi.fn(),
  verifying: false, verifyError: null, verify: async () => {}, checkingStatus: false, checkStatusError: null,
} as unknown as UseDomainPart;

async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
  // Out of time: one last go, so what surfaces is the assertion's own error.
  assertion();
}

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    ensureResourceGroupCreationAccess: vi.fn(),
    getProviderRegistrationState: vi.fn(),
    registerProvider: vi.fn(),
    ensureResourceGroup: vi.fn(),
    resourceGroupExists: vi.fn(),
    ensureLogAnalyticsWorkspace: vi.fn(),
    ensureSubscriptionDiagnostics: vi.fn(),
    ensureAppInsights: vi.fn(),
    ensureStorageAccount: vi.fn(),
    ensureStorageContainer: vi.fn(),
    ensureDeleteLock: vi.fn(),
    ensureBlobDiagnostics: vi.fn(),
    findStorageAccountGroup: vi.fn(),
    storageAccountNameAvailable: vi.fn(),
    ensureRbacRoleAtScope: vi.fn(),
    hasRbacRoleAtScope: vi.fn(),
    listLocations: vi.fn(),
    getExistingSP: vi.fn(),
    ensureScopeConsent: vi.fn(),
    resourceGroupScope: vi.fn((subscriptionId: string, resourceGroupName: string) => `${subscriptionId}/${resourceGroupName}`),
    storageAccountScope: vi.fn(
      (subscriptionId: string, resourceGroupName: string, storageAccountName: string) => `${subscriptionId}/${resourceGroupName}/${storageAccountName}`
    ),
  },
}));

const { configMocks } = vi.hoisted(() => ({
  configMocks: {
    azureClientId: "client-id",
  },
}));

vi.mock("../hooks/util/useAzureAccessCheck", async (importOriginal) => ({ ...await importOriginal<object>(), ensureCardResourceAccess: apiMocks.ensureResourceGroupCreationAccess }));
vi.mock("../api/azureArm", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/azureArm")>(),
  ensureResourceGroupCreationAccess: apiMocks.ensureResourceGroupCreationAccess,
  getProviderRegistrationState: apiMocks.getProviderRegistrationState,
  registerProvider: apiMocks.registerProvider,
  ensureResourceGroup: apiMocks.ensureResourceGroup,
  resourceGroupExists: apiMocks.resourceGroupExists,
  ensureLogAnalyticsWorkspace: apiMocks.ensureLogAnalyticsWorkspace,
  ensureSubscriptionDiagnostics: apiMocks.ensureSubscriptionDiagnostics,
  ensureAppInsights: apiMocks.ensureAppInsights,
  ensureStorageAccount: apiMocks.ensureStorageAccount,
  ensureStorageContainer: apiMocks.ensureStorageContainer,
  ensureDeleteLock: apiMocks.ensureDeleteLock,
  ensureBlobDiagnostics: apiMocks.ensureBlobDiagnostics,
  findStorageAccountGroup: apiMocks.findStorageAccountGroup,
  storageAccountNameAvailable: apiMocks.storageAccountNameAvailable,
  ensureRbacRoleAtScope: apiMocks.ensureRbacRoleAtScope,
  hasRbacRoleAtScope: apiMocks.hasRbacRoleAtScope,
  listLocations: apiMocks.listLocations,
  resourceGroupScope: apiMocks.resourceGroupScope,
  storageAccountScope: apiMocks.storageAccountScope,
}));

vi.mock("../api/azureGraph", () => ({
  getExistingSP: apiMocks.getExistingSP,
}));

vi.mock("../config/azureConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/azureConfig")>()),
  get AZURE_CLIENT_ID() {
    return configMocks.azureClientId;
  },
  ARM_SCOPES: ["arm.scope"],
  APP_SCOPES: ["app.scope"],
}));

vi.mock("../auth/msal", () => ({
  ensureScopeConsent: apiMocks.ensureScopeConsent,
}));

function HookHarness(
  props: {
    onUpdate: (value: PartRun<UseTerraformStatePart>) => void;
  } & Parameters<typeof useTerraformStatePart>[0]
) {
  const value = usePartRun(useTerraformStatePart(props));
  useEffect(() => {
    props.onUpdate(value);
  }, [value, props]);
  return null;
}

// The card's region list, which the parts no longer load themselves.
function LocationsHarness({ onUpdate, ...target }: Parameters<typeof useAzureLocations>[0] & { onUpdate: (value: ReturnType<typeof useAzureLocations>) => void }) {
  onUpdate(useAzureLocations(target));
  return null;
}

function baseProps(overrides: Partial<Parameters<typeof useTerraformStatePart>[0]> = {}): Parameters<typeof useTerraformStatePart>[0] {
  return {
    azureAccount: { tenantId: "tenant-1" } as AzureAccount,
    subscriptionId: "sub-1",
    location: "australiaeast",
    corpName: "Zenblox",
    spClientId: "client-a",
    tenantId: "tenant-1",
    variableValues: {},
    ...overrides,
  };
}

describe("useTerraformStatePart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    configMocks.azureClientId = "client-id";
    apiMocks.ensureResourceGroupCreationAccess.mockResolvedValue(undefined);

    apiMocks.resourceGroupExists.mockResolvedValue(true);
    apiMocks.ensureScopeConsent.mockResolvedValue(false);
    apiMocks.getExistingSP.mockResolvedValue({ id: "sp-1" });
    apiMocks.hasRbacRoleAtScope.mockResolvedValue(true);
    apiMocks.listLocations.mockResolvedValue([{ name: "eastus", displayName: "East US" }]);

    apiMocks.getProviderRegistrationState.mockResolvedValue("Registered");
    apiMocks.ensureResourceGroup.mockResolvedValue("created");
    apiMocks.ensureRbacRoleAtScope.mockResolvedValue("created");
    apiMocks.ensureLogAnalyticsWorkspace.mockResolvedValue({ result: "created", id: "/law-id" });
    apiMocks.ensureSubscriptionDiagnostics.mockResolvedValue("created");
    apiMocks.ensureAppInsights.mockResolvedValue("created");
    apiMocks.ensureStorageAccount.mockResolvedValue("created");
    apiMocks.ensureStorageContainer.mockResolvedValue("created");
    apiMocks.ensureDeleteLock.mockResolvedValue("created");
    apiMocks.ensureBlobDiagnostics.mockResolvedValue("created");
    apiMocks.findStorageAccountGroup.mockResolvedValue(null);
    apiMocks.storageAccountNameAvailable.mockResolvedValue(true);
  });

  it("shows failed resource access beside Create and in collapsible prerequisites below it", async () => {
    apiMocks.ensureResourceGroupCreationAccess.mockRejectedValue(new Error("Missing role assignment access"));
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const props = baseProps();
    function Harness() {
      const infra = usePartRun(useTerraformStatePart(props));
      useEffect(() => { latest = infra; }, [infra]);
      return (
        <ThemeProvider theme={theme}>
          <CoreEnvironmentSection
            infra={infra} createDomain={idleDomain} azureAccount={props.azureAccount} corpName={props.corpName} dnsName="zenblox.io"
            subscriptionId={props.subscriptionId} tenantId="tenant-1" spClientId={props.spClientId}
            githubAccount={null} repoName="repo" selectedEnv={null}
            variables={{ values: {}, loading: false, refreshing: false, error: false, onRefresh: async () => {}, onConfirmed: vi.fn() }}
            frontend={readyFrontend} backend={readyBackend} missing={[]}
          />
        </ThemeProvider>
      );
    }
    try {
      await act(async () => root.render(<Harness />));
      await waitFor(() => expect(latest?.creationAccess.status).toBe("error"));
      const alert = container.querySelector('[role="alert"]')!;
      const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="core-infra-prerequisites"]')!;
      expect(alert.textContent).toContain("Insufficient permissions to continue");
      expect(alert.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      await act(async () => toggle.click());
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const panel = container.querySelector('#core-infra-prerequisites[role="region"]')!;
      expect(panel.textContent).toContain("Missing role assignment access");
      expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Recheck resource access")).toHaveLength(1);
      apiMocks.ensureResourceGroupCreationAccess.mockResolvedValue(undefined);
      const retry = [...panel.querySelectorAll("button")].find((button) => button.textContent === "Recheck resource access")!;
      await act(async () => retry.click());
      await waitFor(() => expect(latest?.creationAccess.status).toBe("ready"));
      expect(container.textContent).not.toContain("Insufficient permissions to continue");
      expect(container.querySelector('[aria-controls="core-infra-prerequisites"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("opens the short code and domain while either is missing, and closes them once both are saved", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const props = baseProps();
    function Harness({ corpName }: { corpName: string }) {
      const infra = usePartRun(useTerraformStatePart(props));
      return (
        <ThemeProvider theme={theme}>
          <CoreEnvironmentSection
            infra={infra} createDomain={idleDomain} frontend={readyFrontend} backend={readyBackend} azureAccount={props.azureAccount} corpName={corpName}
            dnsName="zenblox.io" subscriptionId={props.subscriptionId} tenantId="tenant-1" spClientId={props.spClientId}
            githubAccount={null} repoName="repo" selectedEnv={null}
            variables={{ values: {}, loading: false, refreshing: false, error: false, onRefresh: async () => {}, onConfirmed: vi.fn() }}
            missing={[]}
          />
        </ThemeProvider>
      );
    }
    const toggle = () => container.querySelector<HTMLButtonElement>('[aria-controls="core-environment-settings"]')!;
    try {
      await act(async () => root.render(<Harness corpName="" />));
      expect(toggle().getAttribute("aria-expanded")).toBe("true");
      await act(async () => root.render(<Harness corpName="zenblox" />));
      expect(toggle().getAttribute("aria-expanded")).toBe("false");
      // Still the user's to open, and it stays open.
      await act(async () => toggle().click());
      expect(toggle().getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("#core-environment-settings")?.textContent).toContain("Prerequisites");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  // "Graph" is skipped while the permissions step is turned off.
  it.each(["ARM"])("keeps %s authorization failures in the appropriate access surface", async (service) => {
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<HookHarness {...baseProps()} onUpdate={(value) => { latest = value; }} />);
    });
    expect(latest?.creationAccess.status).toBe("ready");
    if (service === "ARM") {
      apiMocks.ensureRbacRoleAtScope.mockRejectedValueOnce(new Error("403 /subscriptions/sub-1/resourceGroups/group/providers/Microsoft.Authorization/roleAssignments/role: AuthorizationFailed"));
    } else {
      apiMocks.ensureScopeConsent.mockRejectedValueOnce(new Error("403 /applications/app: Graph permission denied"));
    }
    await act(async () => { await latest?.run(); });
    expect(latest?.creationAccess.status).toBe(service === "ARM" ? "error" : "ready");
    expect(latest?.steps.some((step) => step.status === "error")).toBe(true);
    await act(async () => root.unmount());
  });

  it("computes resultMatches when the persisted result no longer matches props", async () => {
    localStorage.setItem("zeninstaller_infra_result", JSON.stringify({ corpName: "Zenblox", subscriptionId: "sub-1" }));

    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    expect(latest?.resultMatches).toBe(true);

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ corpName: "ZenbloxTwo" })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.resultMatches).toBe(false);
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps infra status unknown when RBAC prerequisites are missing", async () => {
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ azureAccount: null })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    expect(latest?.infraRbacStatus).toBe("unknown");
    expect(apiMocks.resourceGroupExists).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("marks infra status rg-not-found when resource group does not exist", async () => {
    apiMocks.resourceGroupExists.mockResolvedValueOnce(false);
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.infraRbacStatus).toBe("rg-not-found");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("marks infra status missing-role when service principal is missing", async () => {
    apiMocks.getExistingSP.mockResolvedValueOnce(null);
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.infraRbacStatus).toBe("missing-role");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("marks infra status missing-role when contributor role is absent", async () => {
    apiMocks.hasRbacRoleAtScope.mockResolvedValueOnce(false);
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.infraRbacStatus).toBe("missing-role");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("marks infra status ready when resource group exists and contributor role is present", async () => {
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.infraRbacStatus).toBe("ready");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("falls back to unknown infra status when RBAC probe throws", async () => {
    apiMocks.resourceGroupExists.mockRejectedValueOnce(new Error("token error"));
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.infraRbacStatus).toBe("unknown");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("clears locations when account/subscription are missing", async () => {
    let latest: ReturnType<typeof useAzureLocations> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <LocationsHarness
          {...baseProps({ azureAccount: null })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    expect(latest?.locations).toEqual([]);
    expect(apiMocks.listLocations).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("loads subscription locations successfully", async () => {
    let latest: ReturnType<typeof useAzureLocations> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <LocationsHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.locationsLoading).toBe(false);
      expect(latest?.locations).toEqual([{ name: "eastus", displayName: "East US" }]);
      expect(latest?.locationsError).toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("sets locationsError when regions cannot be loaded", async () => {
    apiMocks.listLocations.mockRejectedValueOnce(new Error("region fetch failed"));
    let latest: ReturnType<typeof useAzureLocations> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <LocationsHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.locationsLoading).toBe(false);
      expect(latest?.locationsError).toBe("region fetch failed");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("runs full provisioning flow and records skipped details when resources exist", async () => {
    apiMocks.ensureResourceGroup.mockResolvedValueOnce("exists");
    apiMocks.ensureRbacRoleAtScope.mockResolvedValueOnce("exists").mockResolvedValueOnce("exists");
    apiMocks.ensureLogAnalyticsWorkspace.mockResolvedValueOnce({ result: "exists", id: "/law-id" });
    apiMocks.ensureSubscriptionDiagnostics.mockResolvedValueOnce("exists");
    apiMocks.ensureAppInsights.mockResolvedValueOnce("exists");
    apiMocks.ensureStorageAccount.mockResolvedValueOnce("exists");
    apiMocks.ensureStorageContainer.mockResolvedValueOnce("exists");

    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await act(async () => {
      await latest?.run();
    });

    await waitFor(() => {
      expect(latest?.running).toBe(false);
      expect(latest?.steps.find((s) => s.id === "rg")?.status).toBe("skipped");
      expect(latest?.steps.find((s) => s.id === "rg")?.detail).toBe("Already exists");
      expect(latest?.steps.find((s) => s.id === "rbac")?.status).toBe("skipped");
      expect(latest?.steps.find((s) => s.id === "rbac")?.detail).toBe("Already assigned");
      expect(localStorage.getItem("zeninstaller_infra_result")).not.toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
  });

  // Skipped while the permissions and provider-registration steps are turned off.
  it.skip("asks for every scope up front, one call per resource, before doing any work", async () => {
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await act(async () => {
      await latest?.run();
    });

    await waitFor(() => {
      expect(apiMocks.ensureScopeConsent).toHaveBeenCalledTimes(1);
    });
    // ARM consent is already established by the Azure login card, so only Graph is asked for here.
    expect(apiMocks.ensureScopeConsent.mock.calls[0][1]).toEqual(["app.scope"]);
    // Nothing may run before consent is settled — a redirect here must cost no progress.
    expect(apiMocks.ensureScopeConsent.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.ensureResourceGroup.mock.invocationCallOrder[0]);
    expect(latest?.steps.find((s) => s.id === "consent")?.status).toBe("skipped");

    await act(async () => {
      root.unmount();
    });
  });

  it("marks rg-rbac as error when service principal cannot be resolved in run", async () => {
    apiMocks.getExistingSP.mockResolvedValue(null);
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ spClientId: "client-z" })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await act(async () => {
      await latest?.run();
    });

    await waitFor(() => {
      expect(latest?.steps.find((s) => s.id === "rg-rbac")?.status).toBe("error");
      expect(latest?.steps.find((s) => s.id === "rg-rbac")?.detail).toContain("Service principal for app client-z not found");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("marks current step error with generic Failed message for non-Error throws", async () => {
    apiMocks.ensureResourceGroup.mockRejectedValue("bad");
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await act(async () => {
      await latest?.run();
    });

    await waitFor(() => {
      expect(latest?.steps.find((s) => s.id === "rg")?.status).toBe("error");
      expect(latest?.steps.find((s) => s.id === "rg")?.detail).toBe("Failed");
      expect(latest?.running).toBe(false);
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("reset clears the local result and persisted storage", async () => {
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await act(async () => {
      await latest?.run();
    });

    await waitFor(() => {
      expect((latest?.steps.length ?? 0) > 0).toBe(true);
      expect(localStorage.getItem("zeninstaller_infra_result")).not.toBeNull();
    });

    await act(async () => {
      latest?.reset();
    });

    expect(localStorage.getItem("zeninstaller_infra_result")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("is done once the RBAC check passes and the state account is saved", async () => {
    let latest: PartRun<UseTerraformStatePart> | null = null;
    const root = createRoot(document.createElement("div"));

    apiMocks.hasRbacRoleAtScope.mockResolvedValueOnce(false);
    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps()}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.done).toBe(false);
    });

    apiMocks.hasRbacRoleAtScope.mockResolvedValueOnce(true);
    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ tenantId: "tenant-2", variableValues: { TF_STATE_STORAGE_ACCOUNT: "zeninstallerterraform" } })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.done).toBe(true);
    });

    await act(async () => {
      root.unmount();
    });
  });
});

describe("hostingEnvironmentFace", () => {
  const part = (done: boolean, access: CardResourceAccess["status"] = "ready") => ({ done, creationAccess: { status: access } });
  const face = (input: Partial<Parameters<typeof hostingEnvironmentFace>[0]> = {}) =>
    hostingEnvironmentFace({ parts: [part(true), part(false)], configured: true, corpName: "Zenblox", ...input });

  it("puts what stops a run before progress", () => {
    expect(face({ configured: false })).toMatchObject({ status: "error", summary: "Unavailable" });
    expect(face({ parts: [part(true, "checking"), part(false, "error")] })).toMatchObject({ status: "loading", summary: "Checking Azure resource access" });
    expect(face({ names: [{ checking: true }] })).toMatchObject({ status: "loading", summary: "Checking a resource name" });
    expect(face({ parts: [part(true, "error")] })).toMatchObject({ status: "error", summary: "Insufficient permissions to continue" });
    expect(face({ corpName: "" })).toMatchObject({ status: "warning", summary: "COMPANY_SHORT_CODE not set" });
    expect(face()).toMatchObject({ done: false, status: "warning", summary: "Set up the private hosting environment" });
    expect(face({ parts: [part(true), part(true)] })).toMatchObject({ done: true, status: "complete", summary: "Hosting environment ready" });
  });
});
