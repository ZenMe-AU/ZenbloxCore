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
import type { UseTerraformStatePart } from "../cards/CoreInfra/useTerraformStatePart";
import type { CardResourceAccess } from "../hooks/util/useAzureCardAccess";
import { useDomainPart, type UseDomainPart } from "../cards/CoreInfra/useDomainPart";
import type { AzureAccount } from "../types";
import theme from "../theme";
import type { UseFrontendPart } from "../cards/CoreInfra/useFrontendPart";
import type { UseBackendPart } from "../cards/CoreInfra/useBackendPart";

// The private group's parts of the same section, with access in place, so only the core part under test shows its access.
const readyFrontend = { cardId: "private_frontend_infra", creationAccess: { status: "ready" } } as unknown as UseFrontendPart;
const readyBackend = { cardId: "remote_terminal_infra", creationAccess: { status: "ready" } } as unknown as UseBackendPart;

// The state backend part of the same block, done and with access in place, so only the domain's access shows.
const doneStateBackend = {
  cardId: "core_infra", status: "complete", summary: "", done: true, steps: [], running: false, run: async () => true, reset: vi.fn(), runNonce: 0,
  creationAccess: { status: "ready", error: null, failureKind: null, retry: vi.fn(), check: vi.fn(), reportFailure: vi.fn(), missingRoles: null, missingEntra: null, unregisteredProviders: [], registeringProviders: false, registerProviders: async () => {}, missingConsent: [], grantConsent: vi.fn() } as CardResourceAccess, resourceGroupName: "zbcore-zenblox-rg", lawName: "zbcore-zenblox-law",
  storage: { name: "zbcorezenblox", apply: vi.fn(), check: async () => true, checking: false, error: null },
  containerName: "tfstate", result: null, resultMatches: false, infraRbacStatus: "unknown",
} as unknown as UseTerraformStatePart;

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
    getMsal: vi.fn(),
    ensureScopeConsent: vi.fn(),
    getProviderRegistrationState: vi.fn(),
    registerProvider: vi.fn(),
    ensureDnsZone: vi.fn(),
    ensureDnsTxtRecord: vi.fn(),
    ensureResourceGroup: vi.fn(),
    ensureLogAnalyticsWorkspace: vi.fn(),
    listLocations: vi.fn().mockResolvedValue([]),
    getEntraDomain: vi.fn(),
    createEntraDomain: vi.fn(),
    getDomainVerificationTxt: vi.fn(),
    listVerifiedDomains: vi.fn().mockResolvedValue([]),
    getExistingSP: vi.fn(),
    isConsentError: vi.fn(),
  },
}));

const { configMocks } = vi.hoisted(() => ({
  configMocks: {
    azureClientId: "client-id",
  },
}));

vi.mock("../auth/msal", () => ({
  getMsal: apiMocks.getMsal,
  ensureScopeConsent: apiMocks.ensureScopeConsent,
}));

vi.mock("../hooks/util/useAzureAccessCheck", async (importOriginal) => ({ ...await importOriginal<object>(), ensureCardResourceAccess: apiMocks.ensureResourceGroupCreationAccess }));
vi.mock("../api/azureArm", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/azureArm")>(),
  ensureResourceGroupCreationAccess: apiMocks.ensureResourceGroupCreationAccess,
  getProviderRegistrationState: apiMocks.getProviderRegistrationState,
  registerProvider: apiMocks.registerProvider,
  ensureDnsZone: apiMocks.ensureDnsZone,
  ensureDnsTxtRecord: apiMocks.ensureDnsTxtRecord,
  ensureResourceGroup: apiMocks.ensureResourceGroup,
  ensureLogAnalyticsWorkspace: apiMocks.ensureLogAnalyticsWorkspace,
  listLocations: apiMocks.listLocations,
}));

vi.mock("../api/azureGraph", () => ({
  getEntraDomain: apiMocks.getEntraDomain,
  createEntraDomain: apiMocks.createEntraDomain,
  getDomainVerificationTxt: apiMocks.getDomainVerificationTxt,
  listVerifiedDomains: apiMocks.listVerifiedDomains,
  getExistingSP: apiMocks.getExistingSP,
}));

vi.mock("../logic/consent", () => ({
  isConsentError: apiMocks.isConsentError,
}));

vi.mock("../config/azureConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/azureConfig")>()),
  get AZURE_CLIENT_ID() {
    return configMocks.azureClientId;
  },
  ARM_SCOPES: ["arm.scope"],
  APP_SCOPES: ["app.scope"],
  DOMAIN_SCOPES: ["domain.scope"],
}));

function HookHarness(
  props: {
    onUpdate: (value: PartRun<UseDomainPart>) => void;
  } & Parameters<typeof useDomainPart>[0]
) {
  const value = usePartRun(useDomainPart(props));
  useEffect(() => {
    props.onUpdate(value);
  }, [value, props]);
  return null;
}

function baseProps(overrides: Partial<Parameters<typeof useDomainPart>[0]> = {}): Parameters<typeof useDomainPart>[0] {
  return {
    azureAccount: { tenantId: "tenant-1" } as AzureAccount,
    subscriptionId: "sub-1",
    location: "australiaeast",
    corpName: "Zenblox",
    dnsName: "zenblox.io",
    tenantId: "tenant-1",
    ...overrides,
  };
}

describe("useDomainPart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    configMocks.azureClientId = "client-id";
    apiMocks.ensureResourceGroupCreationAccess.mockResolvedValue(undefined);

    apiMocks.getMsal.mockResolvedValue({
      acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    });
    apiMocks.ensureScopeConsent.mockResolvedValue(false);
    apiMocks.getProviderRegistrationState.mockResolvedValue("Registered");
    apiMocks.ensureDnsZone.mockResolvedValue({ result: "created", nameServers: ["ns1", "ns2"] });
    apiMocks.ensureDnsTxtRecord.mockResolvedValue("created");
    apiMocks.ensureResourceGroup.mockResolvedValue("created");
    apiMocks.ensureLogAnalyticsWorkspace.mockResolvedValue({ result: "created", id: "law-id" });
    apiMocks.getEntraDomain.mockResolvedValue(null);
    apiMocks.createEntraDomain.mockResolvedValue({ isVerified: false, isDefault: false });
    apiMocks.getDomainVerificationTxt.mockResolvedValue("txt-token");
    apiMocks.getExistingSP.mockResolvedValue({ id: "sp-1" });
    apiMocks.isConsentError.mockReturnValue(false);
  });

  it("shows failed resource access as an alert and in collapsible prerequisites below it", async () => {
    apiMocks.ensureResourceGroupCreationAccess.mockRejectedValue(new Error("Missing DNS access"));
    apiMocks.getEntraDomain.mockResolvedValue({ isVerified: true, isDefault: true });
    let latest: PartRun<UseDomainPart> | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const props = baseProps();
    function Harness() {
      const domain = usePartRun(useDomainPart(props));
      useEffect(() => { latest = domain; }, [domain]);
      return (
        <ThemeProvider theme={theme}>
          <CoreEnvironmentSection
            infra={doneStateBackend} createDomain={domain} azureAccount={props.azureAccount} corpName={props.corpName} dnsName={props.dnsName}
            subscriptionId={props.subscriptionId} tenantId="tenant-1" spClientId="client-a" githubAccount={null} repoName="repo" selectedEnv={null}
            variables={{ values: {}, loading: false, refreshing: false, error: false, onRefresh: async () => {}, onConfirmed: vi.fn() }}
            frontend={readyFrontend} backend={readyBackend} missing={[]}
          />
        </ThemeProvider>
      );
    }
    try {
      await act(async () => root.render(<Harness />));
      await waitFor(() => {
        expect(latest?.creationAccess.status).toBe("error");
        expect(latest?.done).toBe(true);
      });
      const alert = container.querySelector('[role="alert"]')!;
      const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="core-infra-prerequisites"]')!;
      expect(alert.textContent).toContain("Insufficient permissions to continue");
      expect(alert.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      await act(async () => toggle.click());
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const panel = container.querySelector('#core-infra-prerequisites[role="region"]')!;
      expect(panel.textContent).toContain("Missing DNS access");
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

  it("computes resourcesDone from resultMatches and drops stale persisted state", async () => {
    localStorage.setItem(
      "zeninstaller_create_domain_result",
      JSON.stringify({
        corpName: "Zenblox",
        dnsName: "zenblox.io",
        subscriptionId: "sub-1",
        nameServers: ["old-ns"],
      })
    );

    let latest: PartRun<UseDomainPart> | null = null;
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

    expect(latest?.resourcesDone).toBe(true);
    expect(latest?.done).toBe(true);

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ dnsName: "new.zenblox.io" })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.resourcesDone).toBe(false);
      expect(latest?.nameServers).toEqual([]);
      expect(latest?.steps).toEqual([]);
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("suppresses check-status consent errors but surfaces non-consent errors", async () => {
    apiMocks.getEntraDomain.mockRejectedValueOnce(new Error("AADSTS65001"));
    apiMocks.isConsentError.mockImplementation((msg: string) => msg.includes("AADSTS65001"));

    let latest: PartRun<UseDomainPart> | null = null;
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
      expect(latest?.checkingStatus).toBe(false);
      expect(latest?.checkStatusError).toBeNull();
    });

    apiMocks.getEntraDomain.mockRejectedValueOnce(new Error("network down"));
    apiMocks.isConsentError.mockReturnValue(false);
    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ tenantId: "tenant-2" })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.checkingStatus).toBe(false);
      expect(latest?.checkStatusError).toBe("network down");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("runs full setup and creates domain/txt when needed", async () => {
    let latest: PartRun<UseDomainPart> | null = null;
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
      expect(latest?.steps.find((s) => s.id === "dns")?.status).toBe("done");
      expect(latest?.steps.find((s) => s.id === "domain")?.status).toBe("done");
      expect(latest?.steps.find((s) => s.id === "txt")?.status).toBe("done");
      expect(apiMocks.createEntraDomain).toHaveBeenCalled();
      expect(apiMocks.ensureDnsTxtRecord).toHaveBeenCalled();
      expect(latest?.nameServers).toEqual(["ns1", "ns2"]);
      expect(localStorage.getItem("zeninstaller_create_domain_result")).not.toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("skips the domain and TXT steps when the domain is already verified", async () => {
    apiMocks.getEntraDomain.mockResolvedValue({ isVerified: true, isDefault: true });
    let latest: PartRun<UseDomainPart> | null = null;
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
      expect(latest?.steps.find((s) => s.id === "domain")?.status).toBe("skipped");
      expect(latest?.steps.find((s) => s.id === "txt")?.detail).toBe("Domain already verified");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it.skip("asks for every scope up front, one call per resource, before doing any work", async () => {
    let latest: PartRun<UseDomainPart> | null = null;
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
    expect(apiMocks.ensureScopeConsent.mock.calls[0][1]).toEqual(["domain.scope", "app.scope"]);
    // Nothing may run before consent is settled — a redirect here must cost no progress.
    expect(apiMocks.ensureScopeConsent.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.getProviderRegistrationState.mock.invocationCallOrder[0]);
    expect(latest?.steps.find((s) => s.id === "consent")?.status).toBe("skipped");

    await act(async () => {
      root.unmount();
    });
  });

  it("fails run when TXT token is missing", async () => {
    apiMocks.getDomainVerificationTxt.mockResolvedValueOnce("");
    let latest: PartRun<UseDomainPart> | null = null;
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
      expect(latest?.steps.find((s) => s.id === "txt")?.status).toBe("error");
      expect(latest?.steps.find((s) => s.id === "txt")?.detail).toBe("No TXT verification record returned by Microsoft Graph");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("routes consent errors in run to domain consent and handles redirect failure", async () => {
    apiMocks.createEntraDomain.mockRejectedValueOnce(new Error("AADSTS65001"));
    apiMocks.isConsentError.mockImplementation((msg: string) => msg.includes("AADSTS65001"));
    apiMocks.getMsal.mockResolvedValueOnce({
      acquireTokenRedirect: vi.fn().mockRejectedValue(new Error("redirect failed")),
    });

    let latest: PartRun<UseDomainPart> | null = null;
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
      expect(latest?.steps.find((s) => s.id === "domain")?.detail).toBe("Consent redirect failed — try again");
      expect(apiMocks.getMsal).toHaveBeenCalled();
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("reset clears volatile state and persisted result", async () => {
    let latest: PartRun<UseDomainPart> | null = null;
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
      expect(localStorage.getItem("zeninstaller_create_domain_result")).not.toBeNull();
    });

    await act(async () => {
      latest?.reset();
    });

    expect(latest?.nameServers).toEqual([]);
    expect(localStorage.getItem("zeninstaller_create_domain_result")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("is done once the domain is set up", async () => {
    let latest: PartRun<UseDomainPart> | null = null;
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
      expect(latest?.done).toBe(false);
    });

    apiMocks.getEntraDomain.mockResolvedValueOnce({ isVerified: true, isDefault: true });
    await act(async () => {
      await latest?.run();
    });

    await waitFor(() => {
      expect(latest?.done).toBe(true);
    });

    await act(async () => {
      root.unmount();
    });
  });
});
