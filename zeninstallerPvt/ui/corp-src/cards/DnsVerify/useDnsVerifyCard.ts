/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { getEntraDomain, verifyEntraDomain, setPrimaryEntraDomain, listVerifiedDomains } from "../../api/azureGraph";
import { findDnsZone } from "../../api/azureArm";
import type { VerifiedDomain } from "../../api/azureGraph";
import { isConsentError } from "../../logic/consent";
import { AZURE_CLIENT_ID } from "../../config/azureConfig";
import type { AzureAccount, CardHook, CardRequirements, CardStatus } from "../../types";
import { isDomainName } from "../../logic/variables";

export interface UseDnsVerifyCardParams {
  azureAccount: AzureAccount | null;
  subscriptionId: string;
  tenantId?: string;
  dnsName: string;
}

// Where each action stands, each shown beside its own button.
export type VerifyState = "idle" | "verifying" | "awaitingPropagation" | "verified" | "failed";
export type PrimaryState = "blocked" | "optional" | "setting" | "primary" | "failed";

export interface UseDnsVerifyCard extends CardHook {
  readonly cardId: "dns_verify";
  checkingStatus: boolean;
  checkStatusError: string | null;
  domainVerified: boolean;
  // The DNS zone's name servers, for the registrar while the domain is unverified.
  nameServers: string[];
  isPrimary: boolean;
  verifyState: VerifyState;
  verifyError: string | null; // Why the last verify failed.
  verify: () => Promise<void>;
  // Optional, and only once the domain is verified; its failure leaves the verification standing.
  primaryState: PrimaryState;
  primaryError: string | null; // Why the last primary change failed.
  setPrimary: () => Promise<void>;
  // Domains this tenant has already proved it owns.
  verifiedDomains: VerifiedDomain[];
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

/*
 * Verifies the corp domain once its registrar points at the Azure DNS zone (create_domain), and can
 * then set it as the tenant's primary domain. Both are always read back from Graph, never saved here.
 * DNS propagation can take hours, so this waits apart from the resources that create it.
 */
export function useDnsVerifyCard({ azureAccount, subscriptionId, tenantId, dnsName }: UseDnsVerifyCardParams): UseDnsVerifyCard {
  const [domainVerified, setDomainVerified] = useState(false);
  const [nameServers, setNameServers] = useState<string[]>([]);
  const [isPrimary, setIsPrimary] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [checkStatusError, setCheckStatusError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // Graph answered but the domain is still unverified: the registrar's NS change has not reached Microsoft yet.
  const [awaitingPropagation, setAwaitingPropagation] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState(false);
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  // Bumped after a verify or primary change, so the list re-reads what Graph now says.
  const [domainsNonce, setDomainsNonce] = useState(0);
  const [verifiedDomains, setVerifiedDomains] = useState<VerifiedDomain[]>([]);

  useEffect(() => {
    // Only a value that can be a domain is looked up; a half-typed or mistyped one stays local.
    if (!azureAccount || !isDomainName(dnsName)) return;
    let cancelled = false;
    setCheckingStatus(true);
    setCheckStatusError(null);
    getEntraDomain(azureAccount, dnsName, tenantId)
      .then(async (domain) => {
        if (cancelled) return;
        setDomainVerified(!!domain?.isVerified);
        setIsPrimary(!!domain?.isDefault);
        // Read from the zone itself, so they show on any device and not only where the zone was created.
        if (domain?.isVerified || !subscriptionId) return;
        const zone = await findDnsZone(azureAccount, subscriptionId, dnsName, tenantId);
        if (!cancelled) setNameServers(zone?.nameServers ?? []);
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
  }, [azureAccount, subscriptionId, dnsName, tenantId]);

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
  }, [azureAccount, tenantId, domainsNonce]);

  const verify = useCallback(async () => {
    if (!azureAccount || !dnsName) return;
    setVerifying(true);
    setVerifyError(null);
    setAwaitingPropagation(false);
    try {
      const domain = await verifyEntraDomain(azureAccount, dnsName, tenantId);
      setDomainVerified(domain.isVerified);
      setIsPrimary(domain.isDefault);
      setAwaitingPropagation(!domain.isVerified);
      setDomainsNonce((nonce) => nonce + 1);
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
  }, [azureAccount, dnsName, tenantId]);

  const setPrimary = useCallback(async () => {
    if (!azureAccount || !dnsName) return;
    setSettingPrimary(true);
    setPrimaryError(null);
    try {
      await setPrimaryEntraDomain(azureAccount, dnsName, tenantId);
      // Shows what Graph now reports rather than assuming the change took.
      const domain = await getEntraDomain(azureAccount, dnsName, tenantId);
      setIsPrimary(!!domain?.isDefault);
      setDomainsNonce((nonce) => nonce + 1);
    } catch (err) {
      setPrimaryError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSettingPrimary(false);
    }
  }, [azureAccount, dnsName, tenantId]);

  // Primary is optional, so verifying is what completes the card.
  const done = domainVerified;
  const azureConfigured = !!AZURE_CLIENT_ID;
  // Assumes prerequisites are met — App locks this card (via cardRequirements) whenever they're not.
  const verifyState: VerifyState = domainVerified ? "verified" : verifying ? "verifying" : verifyError ? "failed" : awaitingPropagation ? "awaitingPropagation" : "idle";
  const primaryState: PrimaryState = isPrimary ? "primary" : settingPrimary ? "setting" : primaryError ? "failed" : domainVerified ? "optional" : "blocked";
  // Once verified the header stays complete: setting primary is optional and reports in its own row.
  const status: CardStatus = !azureConfigured ? "error" : done ? "complete" : checkingStatus || verifying ? "loading" : "warning";
  const summary = !azureConfigured ? "Unavailable"
    : done ? (isPrimary ? "Verified · Primary domain" : `Verified · ${dnsName}`)
      : verifying ? "Verifying domain…" : "Verification required";

  return {
    cardId: "dns_verify" as const,
    checkingStatus,
    checkStatusError,
    domainVerified,
    nameServers,
    isPrimary,
    verifyState,
    verifyError,
    verify,
    primaryState,
    primaryError,
    setPrimary,
    verifiedDomains,
    status,
    summary,
    done,
    cardRequirements: ["azure_login", "core_infra"],
    cardDependencyLabel: "Verify the corp domain",
  };
}
