/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AzureAccount } from "../types";
import AzureAppRegistrationCard from "../cards/AzureAppRegistration/AzureAppRegistrationCard";
import { useAzureAppRegistrationCard, type UseAzureAppRegistrationCard } from "../cards/AzureAppRegistration/useAzureAppRegistrationCard";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import theme from "../theme";

async function waitFor(assertion: () => void, timeoutMs = 1500) {
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
    ensureCardResourceAccess: vi.fn(),
    ensureServicePrincipalAccess: vi.fn(),
    getMsal: vi.fn(),
    ensureScopeConsent: vi.fn(),
    getExistingApp: vi.fn(),
    getAppNameByAppId: vi.fn(),
    createAppRegistration: vi.fn(),
    getExistingSP: vi.fn(),
    hasRbacRole: vi.fn(),
    createServicePrincipal: vi.fn(),
    ensureFederatedCredential: vi.fn(),
    setOidcImmutableSubject: vi.fn(),
    ensureRbacRole: vi.fn(),
    isConsentError: vi.fn(),
    rbacStatus: "ready" as "ready" | "missing-role",
    rbacMissingRoles: [] as string[],
    rbacChecking: false,
    rbacError: null as string | null,
  },
}));

vi.mock("../auth/msal", () => ({
  getMsal: apiMocks.getMsal,
  ensureScopeConsent: apiMocks.ensureScopeConsent,
}));

vi.mock("../api", () => ({
  setOidcImmutableSubject: apiMocks.setOidcImmutableSubject,
}));

vi.mock("../hooks/util/useAzureAccessCheck", async (importOriginal) => ({ ...await importOriginal<object>(), ensureCardResourceAccess: apiMocks.ensureCardResourceAccess }));
vi.mock("../api/azureArm", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/azureArm")>(),
}));

vi.mock("../api/azureGraph", () => ({
  ensureServicePrincipalAccess: apiMocks.ensureServicePrincipalAccess,
  ensureEntraActions: async () => {},
  getExistingApp: apiMocks.getExistingApp,
  getAppNameByAppId: apiMocks.getAppNameByAppId,
  createAppRegistration: apiMocks.createAppRegistration,
  getExistingSP: apiMocks.getExistingSP,
  hasRbacRole: apiMocks.hasRbacRole,
  createServicePrincipal: apiMocks.createServicePrincipal,
  ensureFederatedCredential: apiMocks.ensureFederatedCredential,
  ensureRbacRole: apiMocks.ensureRbacRole,
}));

vi.mock("../logic/consent", () => ({
  isConsentError: apiMocks.isConsentError,
}));

vi.mock("../cards/AzureAppRegistration/useRbacCheck", () => ({
  useRbacCheck: vi.fn(() => ({ status: apiMocks.rbacStatus, missingRoles: apiMocks.rbacMissingRoles, checking: apiMocks.rbacChecking, error: apiMocks.rbacError })),
}));

vi.mock("../config/azureConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/azureConfig")>()),
  AZURE_CLIENT_ID: "client-id",
  APP_SCOPES: ["app.scope"],
  ARM_SCOPES: ["arm.scope"],
}));

vi.mock("../config/githubConfig", () => ({
  VALID_ENVS: ["PROD", "TEST"],
}));

function HookHarness(
  props: {
    onUpdate: (value: UseAzureAppRegistrationCard) => void;
  } & Parameters<typeof useAzureAppRegistrationCard>[0]
) {
  const value = useAzureAppRegistrationCard(props);
  useEffect(() => {
    props.onUpdate(value);
  }, [value, props]);
  return null;
}

function baseProps(overrides: Partial<Parameters<typeof useAzureAppRegistrationCard>[0]> = {}): Parameters<typeof useAzureAppRegistrationCard>[0] {
  return {
    azureAccount: { tenantId: "tenant-home" } as AzureAccount,
    githubAccount: { id: 1, login: "org-one", type: "User" },
    githubRepo: "repo-one",
    githubRepoId: 456789,
    subscriptionId: "sub-1",
    subscriptionLabel: "Main subscription",
    tenantId: "tenant-1",
    variableValues: {},
    manualTenantId: "",
    ...overrides,
  };
}

describe("useAzureAppRegistrationCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    apiMocks.getExistingApp.mockResolvedValue({ appId: "existing-app", id: "app-obj" });
    apiMocks.ensureCardResourceAccess.mockReset().mockResolvedValue(undefined);
    apiMocks.ensureServicePrincipalAccess.mockReset().mockResolvedValue(undefined);
    apiMocks.getAppNameByAppId.mockResolvedValue("Prefilled App");
    apiMocks.createAppRegistration.mockResolvedValue({ appId: "created-app", id: "app-created" });
    apiMocks.getExistingSP.mockResolvedValue({ id: "sp-existing" });
    apiMocks.hasRbacRole.mockResolvedValue(true);
    apiMocks.createServicePrincipal.mockResolvedValue({ id: "sp-created" });
    apiMocks.ensureScopeConsent.mockResolvedValue(false);
    apiMocks.ensureFederatedCredential.mockResolvedValue(undefined);
    apiMocks.ensureRbacRole.mockResolvedValue(undefined);
    apiMocks.isConsentError.mockReturnValue(false);
    apiMocks.getMsal.mockResolvedValue({
      acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    });
    apiMocks.rbacStatus = "ready";
    apiMocks.rbacMissingRoles = [];
    apiMocks.rbacChecking = false;
    apiMocks.rbacError = null;
  });

  it("uses default environments when pipeline valid envs include PROD/TEST", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
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

    expect(latest?.environments).toEqual(["PROD", "TEST"]);

    await act(async () => {
      root.unmount();
    });
  });

  it.each([null, { clientId: "current-client", tenantId: "tenant-1", subscriptionIds: ["sub-1"] }, { clientId: "old-client", tenantId: "tenant-1", subscriptionIds: ["old-subscription"] }])("requires creation for the current target despite saved variables and RBAC: %j", async (saved) => {
    if (saved) localStorage.setItem("zeninstaller_azure_result", JSON.stringify(saved));
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<HookHarness {...baseProps({ variableValues: { AZURE_CLIENT_ID: "current-client", AZURE_PLAN_CLIENT_ID: "current-client" } })} onUpdate={(value) => { latest = value; }} />));
      await act(async () => latest?.onVariablesComplete(true));
      expect(latest).toMatchObject({ status: "warning", summary: "Create app registration", done: false });
    } finally {
      await act(async () => root.unmount());
    }
  });

  it.each(["graph-access", "app", "rbac"])("shows the running %s step instead of a saved ready state", async (step) => {
    localStorage.setItem("zeninstaller_azure_result", JSON.stringify({ clientId: "existing-app", tenantId: "tenant-1", subscriptionIds: ["sub-1"], target: { accountId: 1, repoId: 456789, appName: "zeninstaller-github", environments: ["PROD", "TEST"] } }));
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    if (step === "graph-access") apiMocks.ensureServicePrincipalAccess.mockReturnValueOnce(pending);
    else if (step === "app") apiMocks.getExistingApp.mockImplementationOnce(async () => { await pending; return { appId: "existing-app", id: "app-obj" }; });
    else apiMocks.ensureRbacRole.mockReturnValueOnce(pending);
    let latest: UseAzureAppRegistrationCard | null = null;
    let task: Promise<void> | undefined;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<HookHarness {...baseProps({ variableValues: { AZURE_CLIENT_ID: "existing-app", AZURE_PLAN_CLIENT_ID: "existing-app" } })} onUpdate={(value) => { latest = value; }} />));
      await act(async () => latest?.onVariablesComplete(true));
      expect(latest?.status).toBe("complete");
      await act(async () => { task = latest!.run(); });
      expect(latest?.steps.find((item) => item.status === "running")?.id).toBe(step);
      expect(latest?.status).toBe("loading");
      expect(latest?.summary).toBe(latest?.steps.find((item) => item.status === "running")?.label);
      expect(latest?.done).toBe(false);
    } finally {
      await act(async () => { release(); await task; });
      await act(async () => root.unmount());
    }
  });

  it("reports background access checking and verification failures instead of ready", async () => {
    apiMocks.rbacChecking = true;
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));
    const props = baseProps();
    const render = () => root.render(<HookHarness {...props} onUpdate={(value) => { latest = value; }} />);
    try {
      await act(async () => render());
      expect(latest).toMatchObject({ status: "loading", summary: "Checking app registration access", done: false });
      apiMocks.rbacChecking = false;
      apiMocks.rbacError = "Network unavailable";
      await act(async () => render());
      expect(latest).toMatchObject({ status: "error", summary: "Could not verify app registration access", done: false });
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("tracks the actual RBAC request through checking, success, and failure", async () => {
    const { useRbacCheck: useActualRbacCheck } = await vi.importActual<typeof import("../cards/AzureAppRegistration/useRbacCheck")>("../cards/AzureAppRegistration/useRbacCheck");
    let release!: () => void;
    apiMocks.getExistingSP.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { id: "sp-existing" }; });
    let check!: ReturnType<typeof useActualRbacCheck>;
    const props = baseProps();
    function Harness({ subscriptionId = "sub-1" }) {
      const value = useActualRbacCheck({ azureAccount: props.azureAccount, subscriptionId, spClientId: "client", tenantId: "tenant-1" });
      useEffect(() => { check = value; }, [value]);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<Harness />));
      expect(check).toMatchObject({ checking: true, error: null });
      await act(async () => release());
      expect(check).toMatchObject({ status: "ready", checking: false, error: null });
      apiMocks.hasRbacRole.mockRejectedValueOnce(new Error("Network unavailable"));
      await act(async () => root.render(<Harness subscriptionId="sub-2" />));
      expect(check).toMatchObject({ status: "unknown", checking: false, error: "Network unavailable" });
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("becomes ready only after creation and saving, and invalidates completion for changed inputs", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<HookHarness {...baseProps()} onUpdate={(value) => { latest = value; }} />));
      await act(async () => latest!.run());
      expect(latest).toMatchObject({ status: "warning", summary: "Save app registration connection details", done: false });
      await act(async () => latest?.onVariablesComplete(true));
      expect(latest).toMatchObject({ status: "complete", summary: "App registration ready", done: true });
      await act(async () => latest?.setAppName("another-registration"));
      expect(latest).toMatchObject({ status: "warning", summary: "Create app registration", done: false });
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("does not return to green after a failed rerun", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<HookHarness {...baseProps()} onUpdate={(value) => { latest = value; }} />));
      await act(async () => latest!.run());
      await act(async () => latest?.onVariablesComplete(true));
      expect(latest?.done).toBe(true);
      apiMocks.getExistingApp.mockRejectedValueOnce(new Error("Creation failed"));
      await act(async () => latest!.run());
      expect(latest).toMatchObject({ status: "error", summary: "Failed: Create app registration", done: false });
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("reports fetching the saved app name as activity", async () => {
    let release!: (name: string) => void;
    apiMocks.getAppNameByAppId.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    let latest: UseAzureAppRegistrationCard | null = null;
    let task: Promise<void> | undefined;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<HookHarness {...baseProps()} onUpdate={(value) => { latest = value; }} />));
      await act(async () => { task = latest!.prefillAppName("client"); });
      expect(latest).toMatchObject({ status: "loading", summary: "Fetching app registration name", done: false });
    } finally {
      await act(async () => { release("Existing app"); await task; });
      await act(async () => root.unmount());
    }
  });

  it("falls back to PROD/TEST when pipeline valid envs do not include them", async () => {
    const includesSpy = vi.spyOn(Array.prototype, "includes").mockImplementation(function (this: string[], value: string) {
      if (this.length === 2 && this[0] === "PROD" && this[1] === "TEST") {
        return false;
      }
      return this.indexOf(value) >= 0;
    });

    let latest: UseAzureAppRegistrationCard | null = null;
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

    expect(latest?.environments).toEqual(["PROD", "TEST"]);
    expect(includesSpy).toHaveBeenCalled();
    includesSpy.mockRestore();

    await act(async () => {
      root.unmount();
    });
  });

  it("derives client ids from variable values first, then reports mismatch drift", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({
            variableValues: {
              AZURE_CLIENT_ID: "client-a",
              AZURE_PLAN_CLIENT_ID: "client-b",
            },
          })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    expect(latest?.spClientId).toBe("client-a");
    expect(latest?.planClientIdMismatch).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it("falls back to saved result client id when variables are empty", async () => {
    localStorage.setItem("zeninstaller_azure_result", JSON.stringify({ clientId: "saved-client", tenantId: "tenant-1", subscriptionIds: ["sub-1"] }));

    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ variableValues: {} })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    expect(latest?.spClientId).toBe("saved-client");
    expect(latest?.planClientIdMismatch).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it("resets steps and clears persisted result", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
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
      expect(latest?.result?.clientId).toBe("existing-app");
      expect((latest?.steps.length ?? 0) > 0).toBe(true);
      expect(localStorage.getItem("zeninstaller_azure_result")).not.toBeNull();
    });

    await act(async () => {
      latest?.reset();
    });

    expect(latest?.result).toBeNull();
    expect(latest?.steps).toEqual([]);
    expect(localStorage.getItem("zeninstaller_azure_result")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("returns early when required run inputs are missing", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ azureAccount: null, githubAccount: null, subscriptionId: "" })}
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await act(async () => {
      await latest?.run();
    });

    expect(latest?.running).toBe(false);
    expect(latest?.steps).toEqual([]);
    expect(apiMocks.getExistingApp).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("uses existing app/SP path without creating new resources", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          {...baseProps({ tenantId: undefined, manualTenantId: "" })}
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
      expect(apiMocks.getExistingApp).toHaveBeenCalled();
      expect(apiMocks.createAppRegistration).not.toHaveBeenCalled();
      expect(apiMocks.getExistingSP).toHaveBeenCalled();
      expect(apiMocks.createServicePrincipal).not.toHaveBeenCalled();
      expect(apiMocks.setOidcImmutableSubject).toHaveBeenCalledWith(expect.objectContaining({ login: "org-one" }), "repo-one");
      expect(apiMocks.ensureFederatedCredential).toHaveBeenCalledTimes(2);
      const subjects = apiMocks.ensureFederatedCredential.mock.calls.map((c) => c[3]);
      expect(subjects).toEqual(["repo:org-one@1/repo-one@456789:environment:PROD", "repo:org-one@1/repo-one@456789:environment:TEST"]);
      expect(apiMocks.ensureRbacRole).toHaveBeenCalledTimes(1);
      expect(apiMocks.ensureRbacRole).toHaveBeenCalledWith(expect.anything(), "sub-1", "sp-existing", "Reader", undefined);
      expect(latest?.result?.tenantId).toBe("tenant-home");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("creates app and service principal when they do not exist", async () => {
    apiMocks.getExistingApp.mockResolvedValueOnce(null);
    apiMocks.getExistingSP.mockResolvedValueOnce(null);

    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));

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

    await act(async () => {
      await latest?.run();
    });

    await waitFor(() => {
      expect(apiMocks.createAppRegistration).toHaveBeenCalledWith(expect.anything(), "zeninstaller-github", [], "tenant-2");
      expect(apiMocks.createServicePrincipal).toHaveBeenCalledWith(expect.anything(), "created-app", "tenant-2");
      expect(latest?.result?.clientId).toBe("created-app");
      expect(latest?.result?.tenantId).toBe("tenant-2");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("blocks Graph changes when subscription role-assignment access is missing", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<HookHarness {...baseProps()} onUpdate={(value) => { latest = value; }} />);
    });

    apiMocks.ensureCardResourceAccess.mockResolvedValueOnce({ missingRoles: "Missing roleAssignments/write", unregisteredProviders: [], missingConsent: [] });
    await act(async () => { await latest?.run(); });
    expect(latest?.steps[0]).toMatchObject({ id: "access", status: "error", detail: "Missing roleAssignments/write" });
    expect(apiMocks.ensureScopeConsent).not.toHaveBeenCalled();
    expect(apiMocks.createAppRegistration).not.toHaveBeenCalled();
    expect(apiMocks.ensureFederatedCredential).not.toHaveBeenCalled();
    expect(apiMocks.ensureRbacRole).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("shows failed access beside Grant Reader and in a separate prerequisites section with a working recheck", async () => {
    localStorage.setItem("zeninstaller_azure_result", JSON.stringify({ clientId: "saved-client", tenantId: "tenant-1", subscriptionIds: ["sub-1"] }));
    apiMocks.rbacStatus = "missing-role";
    apiMocks.rbacMissingRoles = ["Reader"];
    apiMocks.ensureCardResourceAccess.mockRejectedValue(new Error(`Missing roleAssignments/write. Activate at ${AZURE_PIM_ACTIVATION_URL}`));
    const container = document.createElement("div");
    const root = createRoot(container);
    let latest: UseAzureAppRegistrationCard | null = null;
    const props = baseProps();
    const variables = {
      values: {}, loading: false, refreshing: false, error: false,
      onRefresh: vi.fn(async () => {}), onConfirmed: vi.fn(),
    };
    function CardHarness() {
      const appReg = useAzureAppRegistrationCard(props);
      useEffect(() => { latest = appReg; }, [appReg]);
      return (
        <ThemeProvider theme={theme}>
          <AzureAppRegistrationCard
            card={{
              cardId: "azure_app_registration", status: appReg.status, summary: appReg.summary,
              locked: false, requirements: [], unavailable: false, expanded: true,
              onToggle: vi.fn(), onRequirementClick: vi.fn(),
            }}
            appReg={appReg}
            githubAccount={null}
            repoName="repo-one"
            selectedEnv={null}
            subscriptionId="sub-1"
            variables={variables}
          />
        </ThemeProvider>
      );
    }

    await act(async () => root.render(<CardHarness />));
    await waitFor(() => {
      expect(latest?.status).toBe("error");
      expect(latest?.summary).toBe("Insufficient permissions to continue");
    });
    const grant = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Grant Reader access on this subscription")!;
    expect(grant.disabled).toBe(true);
    expect(grant.parentElement?.textContent).toContain("Insufficient permissions to continue");
    const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="azure-app-registration-prerequisites"]')!;
    const detailsToggle = container.querySelector<HTMLButtonElement>('[aria-controls="azure-app-registration-connection-details"]')!;
    expect(grant.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(detailsToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.querySelectorAll(".prerequisites-toggle-line")).toHaveLength(2);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(detailsToggle.getAttribute("aria-expanded")).toBe("false");
    const prerequisites = container.querySelector('#azure-app-registration-prerequisites')!;
    expect(prerequisites.textContent).toContain("Missing roleAssignments/write");
    expect(prerequisites.querySelector("a")?.href).toBe(AZURE_PIM_ACTIVATION_URL);

    apiMocks.ensureCardResourceAccess.mockResolvedValue(undefined);
    const retry = Array.from(prerequisites.querySelectorAll("button")).find((button) => button.textContent === "Recheck resource access")!;
    await act(async () => retry.click());
    await waitFor(() => expect(latest?.managementAccess.status).toBe("ready"));
    expect(latest?.status).not.toBe("error");
    expect(container.querySelector('[aria-controls="azure-app-registration-prerequisites"]')).toBeNull();
    expect(grant.parentElement?.textContent).not.toContain("Insufficient permissions to continue");
    await act(async () => root.unmount());
  });

  it("checks Graph service-principal access after consent and before creating the app", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));
    apiMocks.ensureServicePrincipalAccess.mockRejectedValueOnce(new Error("403 /servicePrincipals: Insufficient privileges"));
    await act(async () => {
      root.render(<HookHarness {...baseProps()} onUpdate={(value) => { latest = value; }} />);
    });
    await act(async () => { await latest?.run(); });
    expect(apiMocks.ensureScopeConsent).toHaveBeenCalledTimes(1);
    expect(apiMocks.ensureServicePrincipalAccess).toHaveBeenCalledTimes(1);
    expect(latest?.steps.find((step) => step.id === "graph-access")).toMatchObject({
      status: "error", detail: expect.stringContaining("Application.ReadWrite.All"),
    });
    expect(latest?.managementAccess).toMatchObject({
      status: "error", error: expect.stringContaining("Application Administrator"),
    });
    expect(apiMocks.createAppRegistration).not.toHaveBeenCalled();
    expect(apiMocks.createServicePrincipal).not.toHaveBeenCalled();
    apiMocks.ensureServicePrincipalAccess.mockResolvedValueOnce(undefined);
    await act(async () => latest?.managementAccess.retry());
    expect(apiMocks.ensureServicePrincipalAccess).toHaveBeenCalledTimes(2);
    expect(latest?.managementAccess.status).toBe("ready");
    await act(async () => root.unmount());
  });

  it("invalidates the success warning when the actual RBAC write is denied", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
    const root = createRoot(document.createElement("div"));
    apiMocks.ensureRbacRole.mockRejectedValueOnce(new Error("403 /subscriptions/sub/providers/Microsoft.Authorization/roleAssignments/role: AuthorizationFailed"));
    await act(async () => {
      root.render(<HookHarness {...baseProps()} onUpdate={(value) => { latest = value; }} />);
    });
    expect(latest?.managementAccess.status).toBe("ready");
    await act(async () => { await latest?.run(); });
    expect(latest?.steps.find((step) => step.id === "rbac")?.status).toBe("error");
    expect(latest?.managementAccess).toMatchObject({ status: "error", error: expect.stringContaining("Azure denied access") });
    await act(async () => latest?.managementAccess.retry());
    expect(latest?.managementAccess.status).toBe("ready");
    await act(async () => root.unmount());
  });

  it("asks for every scope up front, one call per resource, before doing any work", async () => {
    let latest: UseAzureAppRegistrationCard | null = null;
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
    expect(apiMocks.ensureScopeConsent.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.getExistingApp.mock.invocationCallOrder[0]);
    expect(latest?.steps.find((s) => s.id === "consent")?.status).toBe("skipped");

    await act(async () => {
      root.unmount();
    });
  });

  it("marks the current step with non-consent errors", async () => {
    apiMocks.getExistingApp.mockRejectedValueOnce(new Error("boom"));
    apiMocks.isConsentError.mockReturnValueOnce(false);

    let latest: UseAzureAppRegistrationCard | null = null;
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
      expect(latest?.steps.find((s) => s.id === "app")?.status).toBe("error");
      expect(latest?.steps.find((s) => s.id === "app")?.detail).toBe("boom");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("attempts consent redirect and keeps consent message when MSAL is unavailable", async () => {
    apiMocks.getExistingApp.mockRejectedValueOnce(new Error("interaction_required"));
    apiMocks.isConsentError.mockReturnValueOnce(true);
    apiMocks.getMsal.mockResolvedValueOnce(null);

    let latest: UseAzureAppRegistrationCard | null = null;
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
      expect(latest?.steps.find((s) => s.id === "app")?.detail).toBe("Additional consent required — redirecting to Microsoft...");
      expect(apiMocks.getMsal).toHaveBeenCalled();
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("reports consent redirect failure when redirect throws", async () => {
    apiMocks.getExistingApp.mockRejectedValueOnce(new Error("AADSTS65001"));
    apiMocks.isConsentError.mockReturnValueOnce(true);
    apiMocks.getMsal.mockResolvedValueOnce({
      acquireTokenRedirect: vi.fn().mockRejectedValue(new Error("redirect failed")),
    });

    let latest: UseAzureAppRegistrationCard | null = null;
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
      expect(latest?.steps.find((s) => s.id === "app")?.detail).toBe("Consent redirect failed — try again");
      expect(latest?.running).toBe(false);
    });

    await act(async () => {
      root.unmount();
    });
  });
});
