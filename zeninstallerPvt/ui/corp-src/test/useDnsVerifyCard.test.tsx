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
    root.render(<Harness azureAccount={account} tenantId="tenant-1" dnsName="zenblox.io" {...params} onUpdate={(value) => {
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
      expect(latest.summary).toBe("Domain verified and primary");
    });

    apiMocks.getEntraDomain.mockRejectedValueOnce(new Error("AADSTS65001"));
    apiMocks.isConsentError.mockReturnValue(true);
    await render({ dnsName: "other.io" });
    await waitFor(() => expect(latest.checkingStatus).toBe(false));
    expect(latest.checkStatusError).toBeNull();
  });

  it("verify returns early without an account", async () => {
    await render({ azureAccount: null });
    await act(async () => latest.verify());
    expect(latest.verifying).toBe(false);
    expect(apiMocks.verifyEntraDomain).not.toHaveBeenCalled();
  });

  it("verify says DNS may still be propagating when the domain stays unverified", async () => {
    apiMocks.verifyEntraDomain.mockResolvedValueOnce({ isVerified: false, isDefault: false });
    await render();
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(latest.verifyError).toBe("Verification did not complete — DNS may still be propagating. Try again shortly.");
      expect(latest.isPrimary).toBe(false);
      expect(latest.summary).toBe("Verify the corp domain");
    });
  });

  it("verify sets the domain as primary when chosen", async () => {
    await render();
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(apiMocks.setPrimaryEntraDomain).toHaveBeenCalledWith(account, "zenblox.io", "tenant-1");
      expect(latest.domainVerified).toBe(true);
      expect(latest.isPrimary).toBe(true);
      expect(latest.verifyError).toBeNull();
      expect(latest.done).toBe(true);
    });
  });

  it("verify leaves primary alone when unticked, and the choice survives a reload", async () => {
    await render();
    await act(async () => latest.setMakePrimary(false));
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(apiMocks.setPrimaryEntraDomain).not.toHaveBeenCalled();
      expect(latest.done).toBe(true);
      expect(latest.summary).toBe("Domain verified");
    });

    await act(async () => root.unmount());
    root = createRoot(document.createElement("div"));
    await render();
    expect(latest.makePrimary).toBe(false);
    // The choice belongs to one domain name.
    await render({ dnsName: "other.io" });
    expect(latest.makePrimary).toBe(true);
  });

  it("verify reports a primary-set failure", async () => {
    apiMocks.setPrimaryEntraDomain.mockRejectedValueOnce(new Error("set primary blocked"));
    await render();
    await act(async () => latest.verify());
    await waitFor(() => {
      expect(latest.verifyError).toBe("Domain verified, but setting it as primary failed: set primary blocked");
      expect(latest.isPrimary).toBe(false);
      expect(latest.summary).toBe("Set the domain as primary");
    });
  });

  it("verify maps consent and non-consent failures to different messages", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render();
    apiMocks.verifyEntraDomain.mockRejectedValueOnce(new Error("AADSTS65001"));
    apiMocks.isConsentError.mockImplementation((message: string) => message.includes("AADSTS65001"));
    await act(async () => latest.verify());
    await waitFor(() => expect(latest.verifyError).toBe("Additional consent required — run the corp domain setup once to grant it."));

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

  it("keeps the primary checkbox after verifying without it, so the user can still choose primary", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const cardRoot = createRoot(container);
    const card: CardChrome = {
      cardId: "dns_verify", status: "warning", locked: false, requirements: [], unavailable: false, expanded: true, onToggle: vi.fn(), onRequirementClick: vi.fn(),
    };
    function CardHarness() {
      const dnsVerify = useDnsVerifyCard({ azureAccount: account, tenantId: "tenant-1", dnsName: "zenblox.io" });
      return (
        <ThemeProvider theme={theme}>
          <DnsVerifyCard card={card} dnsVerify={dnsVerify} dnsName="zenblox.io" nameServers={[]} />
        </ThemeProvider>
      );
    }
    const checkbox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const button = (name: string) => [...container.querySelectorAll("button")].find((element) => element.textContent === name);
    try {
      await act(async () => cardRoot.render(<CardHarness />));
      await waitFor(() => expect(checkbox()?.checked).toBe(true));
      await act(async () => checkbox()!.click());
      expect(checkbox()?.checked).toBe(false);

      await act(async () => button("Verify domain now")!.click());
      await waitFor(() => expect(container.textContent).toContain("Domain zenblox.io is verified."));
      expect(apiMocks.setPrimaryEntraDomain).not.toHaveBeenCalled();
      expect(checkbox()?.checked).toBe(false);

      // Changing their mind after verifying brings the button back.
      apiMocks.getEntraDomain.mockResolvedValue({ isVerified: true, isDefault: false });
      await act(async () => checkbox()!.click());
      await act(async () => button("Set as primary domain")!.click());
      await waitFor(() => expect(container.textContent).toContain("Domain zenblox.io is verified and set as the primary domain."));
      expect(apiMocks.setPrimaryEntraDomain).toHaveBeenCalledTimes(1);
      // Primary can't be unset from here, so the choice goes away.
      expect(checkbox()).toBeNull();
    } finally {
      await act(async () => cardRoot.unmount());
      container.remove();
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
