/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { getEntraDomain, verifyEntraDomain, setPrimaryEntraDomain, listVerifiedDomains } from "../../api/azureGraph";
import type { VerifiedDomain } from "../../api/azureGraph";
import { isConsentError } from "../../logic/consent";
import { createResultStorage } from "../../logic/resultStorage";
import { AZURE_CLIENT_ID } from "../../config/azureConfig";
import type { AzureAccount, CardHook, CardRequirements, CardStatus } from "../../types";
import { isDomainName } from "../../logic/variables";

export interface UseDnsVerifyCardParams {
  azureAccount: AzureAccount | null;
  tenantId?: string;
  dnsName: string;
}

export interface UseDnsVerifyCard extends CardHook {
  readonly cardId: "dns_verify";
  checkingStatus: boolean;
  checkStatusError: string | null;
  domainVerified: boolean;
  isPrimary: boolean;
  makePrimary: boolean;
  setMakePrimary: (makePrimary: boolean) => void;
  verifying: boolean;
  verifyError: string | null;
  verify: () => Promise<void>;
  // Domains this tenant has already proved it owns.
  verifiedDomains: VerifiedDomain[];
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

// Only the choice is saved: whether the domain is verified or primary is always read from Graph.
const { save: savePrimaryChoice, load: loadPrimaryChoice } = createResultStorage<{ dnsName: string; makePrimary: boolean }>("zeninstaller_dns_verify_choice");

/*
 * Verifies the corp domain once its registrar points at the Azure DNS zone (create_domain), then sets
 * it as the tenant's primary domain if chosen. DNS propagation can take hours, so this waits apart
 * from the resources that create it.
 */
export function useDnsVerifyCard({ azureAccount, tenantId, dnsName }: UseDnsVerifyCardParams): UseDnsVerifyCard {
  const [primaryChoice, setPrimaryChoice] = useState(loadPrimaryChoice);
  // dnsName arrives after the first render, so the saved choice is matched against it on every render.
  const makePrimary = primaryChoice?.dnsName === dnsName ? primaryChoice.makePrimary : true;
  const [domainVerified, setDomainVerified] = useState(false);
  const [isPrimary, setIsPrimary] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [checkStatusError, setCheckStatusError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedDomains, setVerifiedDomains] = useState<VerifiedDomain[]>([]);

  useEffect(() => {
    // Only a value that can be a domain is looked up; a half-typed or mistyped one stays local.
    if (!azureAccount || !isDomainName(dnsName)) return;
    let cancelled = false;
    setCheckingStatus(true);
    setCheckStatusError(null);
    getEntraDomain(azureAccount, dnsName, tenantId)
      .then((domain) => {
        if (cancelled) return;
        setDomainVerified(!!domain?.isVerified);
        setIsPrimary(!!domain?.isDefault);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "";
        // Expected before Domain.ReadWrite.All is granted; the corp domain setup asks for it.
        if (!isConsentError(message)) setCheckStatusError(message || "Failed to check domain status");
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, dnsName, tenantId]);

  useEffect(() => {
    if (!azureAccount) return;
    let cancelled = false;
    // Empty until AZURE_TENANT_ID loads, and getToken's ?? treats "" as a real tenant.
    listVerifiedDomains(azureAccount, tenantId || undefined)
      .then((domains) => {
        if (!cancelled) setVerifiedDomains(domains);
      })
      .catch((err) => {
        // Silently empty was indistinguishable from "the call never happened" — say which it is.
        console.warn("Could not list verified domains:", err instanceof Error ? err.message : err);
        if (!cancelled) setVerifiedDomains([]);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, tenantId]);

  // Verifies the domain (if needed) and promotes it to primary — one button drives both.
  const verify = useCallback(async () => {
    if (!azureAccount || !dnsName) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const domain = domainVerified ? await getEntraDomain(azureAccount, dnsName, tenantId) : await verifyEntraDomain(azureAccount, dnsName, tenantId);
      if (!domain) throw new Error(`Domain ${dnsName} not found in tenant`);
      setDomainVerified(domain.isVerified);

      let primary = domain.isDefault;
      if (!domain.isVerified) {
        setVerifyError("Verification did not complete — DNS may still be propagating. Try again shortly.");
      } else if (!primary && makePrimary) {
        try {
          await setPrimaryEntraDomain(azureAccount, dnsName, tenantId);
          primary = true;
        } catch (err) {
          setVerifyError(`Domain verified, but setting it as primary failed: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }
      setIsPrimary(primary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      setVerifyError(
        isConsentError(message)
          ? "Additional consent required — run the corp domain setup once to grant it."
          : "Verification failed — make sure your registrar's NS records point to the Azure DNS name servers, then retry after DNS propagates."
      );
      if (!isConsentError(message)) console.warn("[dns-verify] verify failed:", message);
    } finally {
      setVerifying(false);
    }
  }, [azureAccount, dnsName, tenantId, domainVerified, makePrimary]);

  const setMakePrimary = useCallback(
    (choice: boolean) => {
      const saved = { dnsName, makePrimary: choice };
      setPrimaryChoice(saved);
      savePrimaryChoice(saved);
    },
    [dnsName]
  );

  const done = domainVerified && (isPrimary || !makePrimary);
  const azureConfigured = !!AZURE_CLIENT_ID;
  // Assumes prerequisites are met — App locks this card (via cardRequirements) whenever they're not.
  const status: CardStatus = !azureConfigured ? "error" : checkingStatus || verifying ? "loading" : done ? "complete" : "warning";
  const summary = !azureConfigured ? "Unavailable"
    : done ? (isPrimary ? "Domain verified and primary" : "Domain verified")
      : domainVerified ? "Set the domain as primary" : "Verify the corp domain";

  return {
    cardId: "dns_verify" as const,
    checkingStatus,
    checkStatusError,
    domainVerified,
    isPrimary,
    makePrimary,
    setMakePrimary,
    verifying,
    verifyError,
    verify,
    verifiedDomains,
    status,
    summary,
    done,
    cardRequirements: ["azure_login", "core_infra"],
    cardDependencyLabel: "Verify the corp domain",
  };
}
