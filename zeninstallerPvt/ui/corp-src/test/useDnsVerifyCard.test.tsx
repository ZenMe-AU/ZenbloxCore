/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDnsVerifyCard, type UseDnsVerifyCard, type UseDnsVerifyCardParams } from "../cards/DnsVerify/useDnsVerifyCard";
import DnsVerifyCard from "../cards/DnsVerify/DnsVerifyCard";
import type { AzureAccount, CardChrome } from "../types";
import { ThemeProvider } from "@mui/material";
import theme from "../theme";

const { apiMocks, configMocks } = vi.hoisted(() => ({
  apiMocks: {
    getEntraDomain: vi.fn(),
    verifyEntraDomain: vi.fn(),
    setPrimaryEntraDomain: vi.fn(),
    listVerifiedDomains: vi.fn(),
    findDnsZone: vi.fn(),
    isConsentError: vi.fn(),
  },
  configMocks: { azureClientId: "client-id" },
}));

vi.mock("../api/azureGraph", () => ({
  getEntraDomain: apiMocks.getEntraDomain,
  verifyEntraDomain: apiMocks.verifyEntraDomain,
  setPrimaryEntraDomain: apiMocks.setPrimaryEntraDomain,
  listVerifiedDomains: apiMocks.listVerifiedDomains,
}));
vi.mock("../api/azureArm", () => ({ findDnsZone: apiMocks.findDnsZone }));
vi.mock("../logic/consent", () => ({ isConsentError: apiMocks.isConsentError }));
vi.mock("../config/azureConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/azureConfig")>()),
  get AZURE_CLIENT_ID() {
    return configMocks.azureClientId;
  },
}));

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
  assertion();
}

function Harness({ onUpdate, ...params }: UseDnsVerifyCardParams & { onUpdate: (value: UseDnsVerifyCard) => void }) {
  const value = useDnsVerifyCard(params);
  useEffect(() => {
    onUpdate(value);
  }, [value, onUpdate]);
  return null;
}

const account = { tenantId: "tenant-1" } as AzureAccount;
let root: Root;
let latest: UseDnsVerifyCard;

async function render(params: Partial<UseDnsVerifyCardParams> = {}) {
  await act(async () => {
    root.render(<Harness azureAccount={account} subscriptionId="sub-1" tenantId="tenant-1" dnsName="zenblox.io" {...params} onUpdate={(value) => {
          latest = value;
        }} />);
  });
}

describe("useDnsVerifyCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    configMocks.azureClientId = "client-id";
    apiMocks.getEntraDomain.mockResolvedValue({ isVerified: false, isDefault: false });
    apiMocks.verifyEntraDomain.mockResolvedValue({ isVerified: true, isDefault: false });
    apiMocks.setPrimaryEntraDomain.mockResolvedValue(undefined);
    apiMocks.listVerifiedDomains.mockResolvedValue([]);
    apiMocks.findDnsZone.mockResolvedValue({ nameServers: ["ns1-01.azure-dns.com."], txtValues: [] });
    apiMocks.isConsentError.mockReturnValue(false);
    root = createRoot(document.createElement("div"));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("reads verified and primary from Entra, and ignores consent errors there", async () => {
    apiMocks.getEntraDomain.mockResolvedValueOnce({ isVerified: true, isDefault: true });
    await render();
    await waitFor(() => {
      expect(latest.domainVerified).toBe(true);
      expect(latest.isPrimary).toBe(true);
      expect(latest.status).toBe("complete");
      expect(latest.summary).toBe("Verified · Primary domain");
    });

    apiMocks.getEntraDomain.mockRejectedValueOnce(new Error("AADSTS65001"));
    apiMocks.isConsentError.mockReturnValue(true);
    await render({ dnsName: "other.io" });
    await waitFor(() => expect(latest.checkingStatus).toBe(false));
    expect(latest.checkStatusError).toBeNull();
  });

  it("reads the name servers from the DNS zone only while the domain is unverified", async () => {
    await render();
    await waitFor(() => expect(latest.nameServers).toEqual(["ns1-01.azure-dns.com."]));
    expect(apiMocks.findDnsZone).toHaveBeenCalledWith(account, "sub-1", "zenblox.io", "tenant-1");

    apiMocks.findDnsZone.mockClear();
    apiMocks.getEntraDomain.mockResolvedValueOnce({ isVerified: true, isDefault: true });
    await render({ dnsName: "other.io" });
    await waitFor(() => expect(latest.domainVerified).toBe(true));
    expect(apiMocks.findDnsZone).not.toHaveBeenCalled();
  });

  it("verify returns early without an account", async () => {
    await render({ azureAccount: null });
    await act(async () => latest.verify());
    expect(latest.verifyState).toBe("idle");
    expect(apiMocks.verifyEntraDomain).not.toHaveBeenCalled();
  });

  it("verify waits on DNS propagation only when Graph answers that the domain is still unverified", async () => {
    apiMocks.verifyEntraDomain.mockResolvedValueOnce({ isVerified: false, isDefault: false });
    await render();
    expect(latest.verifyState).toBe("idle");
    expect(latest.primaryState).toBe("blocked");
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(latest.verifyState).toBe("awaitingPropagation");
      expect(latest.verifyError).toBeNull();
      expect(latest.isPrimary).toBe(false);
      expect(latest.status).toBe("warning");
      expect(latest.summary).toBe("Verification required");
    });
  });

  it("verify completes the card without touching primary, which stays optional", async () => {
    await render();
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(latest.domainVerified).toBe(true);
      expect(latest.isPrimary).toBe(false);
      expect(latest.done).toBe(true);
      expect(latest.status).toBe("complete");
      expect(latest.summary).toBe("Verified · zenblox.io");
      expect(latest.verifyState).toBe("verified");
      expect(latest.primaryState).toBe("optional");
    });
    expect(apiMocks.setPrimaryEntraDomain).not.toHaveBeenCalled();
    // The verified list is read again, so it shows what Graph now says.
    expect(apiMocks.listVerifiedDomains).toHaveBeenCalledTimes(2);
  });

  it("setPrimary reads primary back from Graph", async () => {
    await render();
    await act(async () => latest.verify());
    apiMocks.getEntraDomain.mockResolvedValueOnce({ isVerified: true, isDefault: true });
    await act(async () => latest.setPrimary());
    await waitFor(() => {
      expect(apiMocks.setPrimaryEntraDomain).toHaveBeenCalledWith(account, "zenblox.io", "tenant-1");
      expect(latest.isPrimary).toBe(true);
      expect(latest.primaryError).toBeNull();
      expect(latest.primaryState).toBe("primary");
      expect(latest.summary).toBe("Verified · Primary domain");
    });
    expect(apiMocks.listVerifiedDomains).toHaveBeenCalledTimes(3);
  });

  it("a failed setPrimary keeps the verification", async () => {
    await render();
    await act(async () => latest.verify());
    apiMocks.setPrimaryEntraDomain.mockRejectedValueOnce(new Error("set primary blocked"));
    await act(async () => latest.setPrimary());
    await waitFor(() => {
      expect(latest.primaryError).toBe("set primary blocked");
      expect(latest.primaryState).toBe("failed");
      expect(latest.verifyState).toBe("verified");
      expect(latest.verifyError).toBeNull();
      expect(latest.domainVerified).toBe(true);
      expect(latest.isPrimary).toBe(false);
      expect(latest.status).toBe("complete");
    });
  });

  it("verify maps consent and non-consent failures to different messages", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render();
    apiMocks.verifyEntraDomain.mockRejectedValueOnce(new Error("AADSTS65001"));
    apiMocks.isConsentError.mockImplementation((message: string) => message.includes("AADSTS65001"));
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(latest.verifyError).toBe("Additional consent required — run the corp domain setup once to grant it.");
      expect(latest.verifyState).toBe("failed");
    });

    apiMocks.verifyEntraDomain.mockRejectedValueOnce(new Error("network down"));
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(latest.verifyError).toBe(
        "Verification failed — make sure your registrar's NS records point to the Azure DNS name servers, then retry after DNS propagates."
      );
      expect(consoleWarn).toHaveBeenCalled();
    });
    consoleWarn.mockRestore();
  });

  it("shows each action's status beside its button, primary enabled only once verified", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const cardRoot = createRoot(container);
    const card: CardChrome = {
      cardId: "dns_verify", status: "warning", locked: false, requirements: [], unavailable: false, expanded: true, onToggle: vi.fn(), onRequirementClick: vi.fn(),
    };
    function CardHarness() {
      const dnsVerify = useDnsVerifyCard({ azureAccount: account, subscriptionId: "sub-1", tenantId: "tenant-1", dnsName: "zenblox.io" });
      return (
        <ThemeProvider theme={theme}>
          <DnsVerifyCard card={card} dnsVerify={dnsVerify} dnsName="zenblox.io" />
        </ThemeProvider>
      );
    }
    const button = (name: string) => [...container.querySelectorAll("button")].find((element) => element.textContent === name)!;
    try {
      await act(async () => cardRoot.render(<CardHarness />));
      await waitFor(() => expect(container.textContent).toContain("ns1-01.azure-dns.com."));
      expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      expect(container.textContent).toContain("DNS propagation can take minutes to hours.");
      expect(container.querySelector('button[aria-label="Copy all all name servers"]')).not.toBeNull();
      expect(container.textContent).not.toContain("Awaiting domain verification.");
      expect(container.textContent).not.toContain("Verify the domain first.");
      expect(button("Set as primary domain").disabled).toBe(true);

      await act(async () => button("Verify domain now").click());
      await waitFor(() => expect(container.textContent).toContain("Domain verified successfully."));
      expect(container.textContent).not.toContain("Not set as primary domain (optional).");
      expect(button("Verify domain now").disabled).toBe(true);
      expect(button("Set as primary domain").disabled).toBe(false);

      apiMocks.getEntraDomain.mockResolvedValueOnce({ isVerified: true, isDefault: true });
      await act(async () => button("Set as primary domain").click());
      await waitFor(() => expect(container.textContent).toContain("Primary domain set successfully."));
      expect(container.textContent).toContain("Domain verified successfully.");
      expect(button("Set as primary domain").disabled).toBe(true);
    } finally {
      await act(async () => cardRoot.unmount());
      container.remove();
    }
  });

  it("restores both completed statuses from Graph after a reload", async () => {
    apiMocks.getEntraDomain.mockResolvedValue({ isVerified: true, isDefault: true });
    const container = document.createElement("div");
    const cardRoot = createRoot(container);
    const card: CardChrome = {
      cardId: "dns_verify", status: "complete", locked: false, requirements: [], unavailable: false, expanded: true, onToggle: vi.fn(), onRequirementClick: vi.fn(),
    };
    function CardHarness() {
      const dnsVerify = useDnsVerifyCard({ azureAccount: account, subscriptionId: "sub-1", tenantId: "tenant-1", dnsName: "zenblox.io" });
      return <ThemeProvider theme={theme}><DnsVerifyCard card={card} dnsVerify={dnsVerify} dnsName="zenblox.io" /></ThemeProvider>;
    }
    try {
      await act(async () => cardRoot.render(<CardHarness />));
      await waitFor(() => {
        expect(container.textContent).toContain("Domain verified successfully.");
        expect(container.textContent).toContain("Primary domain set successfully.");
      });
      expect(container.textContent).not.toContain("Point your domain at Azure DNS");
    } finally {
      await act(async () => cardRoot.unmount());
    }
  });

  it("is unavailable without an Azure client id", async () => {
    configMocks.azureClientId = "";
    await render();
    await waitFor(() => {
      expect(latest.status).toBe("error");
      expect(latest.summary).toBe("Unavailable");
    });
  });
});
