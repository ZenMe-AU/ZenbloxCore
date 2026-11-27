/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMsal } from "../../auth/msal";
import { DOMAIN_SCOPES } from "../../config/azureConfig";
import { findDnsZone } from "../../api/azureArm";
import { useCardResourceAccess, type CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import { getEntraDomain, getDomainVerificationTxt } from "../../api/azureGraph";
import { isConsentError } from "../../logic/consent";
import { getCoreResourceGroupName, getCoreLogAnalyticsName } from "../../logic/naming";
import { createResultStorage } from "../../logic/resultStorage";
import { isDomainName } from "../../logic/variables";
import type { ProvisionModule } from "../../logic/provisioning";
import { createDomainAccess } from "./config";
import { domainPart, onForbidden } from "./provisioningParts";
import type { ResettableHook, AzureTarget, CardHook } from "../../types";

export type CreateDomainResult = {
  corpName: string;
  dnsName: string;
  subscriptionId: string;
  nameServers: string[];
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDomainPartParams extends AzureTarget {
  location: string; // The card's region, shared by every part.
  corpName: string;
  dnsName: string;
}

export interface UseDomainPart extends Pick<CardHook, "done">, ResettableHook {
  provisioning: ProvisionModule; // This part's tasks, for a card that runs several parts as one graph.
  creationAccess: CardResourceAccess;
  checkingStatus: boolean;
  checkStatusError: string | null;
  resourcesDone: boolean;
  resourceGroupName: string;
  nameServers: string[];
  runNonce: number;
}

const RESULT_KEY = "zeninstaller_create_domain_result";

const { save: saveResult, load: loadResult } = createResultStorage<CreateDomainResult>(RESULT_KEY);

/*
 * The DNS + Entra custom-domain half of corp setup: create the DNS zone, add the domain to Entra and
 * write the verification TXT record. Verifying it and making it primary is the dns_verify card's job.
 */
export function useDomainPart({ azureAccount, subscriptionId, location, corpName, dnsName, tenantId }: UseDomainPartParams): UseDomainPart {
  const [result, setResult] = useState<CreateDomainResult | null>(loadResult);
  const [nameServers, setNameServers] = useState<string[]>(loadResult()?.nameServers ?? []);
  const [runNonce, setRunNonce] = useState(0);

  // A persisted result only counts if it matches the current NAME/DNS/subscription.
  const resultMatches = !!result && result.corpName === corpName && result.dnsName === dnsName && result.subscriptionId === subscriptionId;
  const resourcesDone = resultMatches;

  const resourceGroupName = getCoreResourceGroupName(corpName);
  const lawName = getCoreLogAnalyticsName(corpName);
  const creationAccess = useCardResourceAccess({ azureAccount, subscriptionId: corpName && dnsName ? subscriptionId : "", tenantId }, createDomainAccess(resourceGroupName, lawName, dnsName));
  const { reportFailure: reportAccessFailure } = creationAccess;

  /*
   * Once a subscription is known, ask Graph whether the domain is already set up instead of trusting
   * localStorage, which won't reflect setup done on another device or by hand.
   */
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [checkStatusError, setCheckStatusError] = useState<string | null>(null);

  useEffect(() => {
    // A value that can't be a domain is a typo to fix, not a domain to look up in Graph and DNS.
    if (!azureAccount || !subscriptionId || !corpName || !isDomainName(dnsName)) return;
    let cancelled = false;
    setCheckingStatus(true);
    setCheckStatusError(null);
    getEntraDomain(azureAccount, dnsName, tenantId)
      .then(async (domain) => {
        if (cancelled || !domain) return;
        const save = (servers: string[]) => {
          setNameServers(servers);
          const r: CreateDomainResult = { corpName, dnsName, subscriptionId, nameServers: servers };
          setResult(r);
          saveResult(r);
        };
        if (domain.isVerified) return save([]);
        // Added but unverified: the resources are in place once the zone holds Microsoft's TXT value.
        const [expected, zone] = await Promise.all([
          getDomainVerificationTxt(azureAccount, dnsName, tenantId),
          findDnsZone(azureAccount, subscriptionId, dnsName, tenantId),
        ]);
        if (!cancelled && expected && zone?.txtValues.includes(expected)) save(zone.nameServers);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        /*
         * Consent errors are expected before Domain.ReadWrite.All has been granted —
         * don't surface or redirect here; run() prompts for consent on user action.
         */
        if (!isConsentError(msg)) setCheckStatusError(msg || "Failed to check domain status");
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, corpName, dnsName, tenantId]);

  // Redirects for Domain.ReadWrite.All incremental consent; user re-runs after returning.
  const requestDomainConsent = useCallback(async () => {
    if (!azureAccount) return;
    const msal = await getMsal();
    if (!msal) return;
    await msal.acquireTokenRedirect({
      scopes: DOMAIN_SCOPES,
      account: azureAccount,
      authority: `https://login.microsoftonline.com/${tenantId || azureAccount.tenantId}`,
    });
  }, [azureAccount, tenantId]);

  const provisioning = useMemo<ProvisionModule>(() => ({
    id: "create_domain",
    label: "DNS & custom domain",
    onTaskError: onForbidden(reportAccessFailure),
    onComplete: (output) => {
      const r: CreateDomainResult = { corpName, dnsName, subscriptionId, nameServers: output<string[]>("dns") };
      setResult(r);
      saveResult(r);
      setRunNonce((n) => n + 1);
    },
    tasks: domainPart({
      azureAccount, subscriptionId, tenantId, location, corpName, dnsName, resourceGroupName, lawName,
      requestDomainConsent, onNameServers: setNameServers,
    }),
  }), [azureAccount, subscriptionId, corpName, dnsName, tenantId, location, resourceGroupName, lawName, requestDomainConsent, reportAccessFailure]);

  // Drop stale persisted state when the target changes.
  useEffect(() => {
    if (result && !resultMatches) setNameServers([]);
  }, [result, resultMatches]);

  const reset = useCallback(() => {
    setResult(null);
    saveResult(null);
    setNameServers([]);
  }, []);

  const done = resourcesDone;
  return {
    creationAccess,
    checkingStatus,
    checkStatusError,
    provisioning,
    resourcesDone,
    resourceGroupName,
    nameServers,
    runNonce,
    reset,
    done,
  };
}
