/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { ensureScopeConsent, getMsal } from "../../auth/msal";
import { APP_SCOPES, DNS_PROVIDERS, DOMAIN_SCOPES, GRANT_CONSENT_SCOPES, GRAPH_PERMISSIONS } from "../../config/azureConfig";
import { ensureDnsZone, ensureDnsTxtRecord, ensureResourceGroup, ensureLogAnalyticsWorkspace, findDnsZone, listLocations, type AzureLocation } from "../../api/azureArm";
import { useProviderRegistration } from "../../hooks/util/useProviderRegistration";
import {
  getEntraDomain,
  createEntraDomain,
  getDomainVerificationTxt,
  verifyEntraDomain,
  setPrimaryEntraDomain,
  listVerifiedDomains,
  getExistingSP,
  grantAdminConsent,
  listAppRoleAssignments,
} from "../../api/azureGraph";
import type { VerifiedDomain } from "../../api/azureGraph";
import { isConsentError } from "../../logic/consent";
import { getCoreResourceGroupName, getCoreLogAnalyticsName, DEFAULT_AZURE_LOCATION } from "../../logic/naming";
import { createResultStorage } from "../../logic/resultStorage";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import { AZURE_CLIENT_ID } from "../../config/azureConfig";
import type { AzureConfigHook, AzureSpTarget, CardHook, CardRequirements, CardStatus, SetupStep } from "../../types";

export type CreateDomainResult = {
  corpName: string;
  dnsName: string;
  subscriptionId: string;
  nameServers: string[];
  domainVerified: boolean;
  isPrimary: boolean;
  makePrimary?: boolean; // Missing on results saved before the choice existed, which always made it primary.
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCreateDomainCardParams extends AzureSpTarget {
  corpName: string;
  dnsName: string;
}

// steps / running / run / reset come from AzureConfigHook.
export interface UseCreateDomainCard extends CardHook, AzureConfigHook {
  readonly cardId: "create_domain";
  checkingStatus: boolean;
  checkStatusError: string | null;
  location: string;
  setLocation: (loc: string) => void;
  locations: AzureLocation[];
  locationsLoading: boolean;
  locationsError: string | null;
  resourcesDone: boolean;
  resourceGroupName: string;
  lawName: string;
  nameServers: string[];
  domainVerified: boolean;
  isPrimary: boolean;
  makePrimary: boolean;
  setMakePrimary: (v: boolean) => void;
  runNonce: number;
  verifying: boolean;
  verifyError: string | null;
  verify: () => Promise<void>;
  // Domains this tenant has already proved it owns.
  verifiedDomains: VerifiedDomain[];
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

const RESULT_KEY = "zeninstaller_create_domain_result";

const { save: saveResult, load: loadResult } = createResultStorage<CreateDomainResult>(RESULT_KEY);

/*
 * The DNS + Entra custom-domain half of corp setup: create the DNS zone, add the domain to
 * Entra, write the verification TXT record, verify, and set it primary.
 */
export function useCreateDomainCard({ azureAccount, subscriptionId, corpName, dnsName, spClientId, tenantId }: UseCreateDomainCardParams): UseCreateDomainCard {
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const { ensureRegistered } = useProviderRegistration({ azureAccount, subscriptionId, tenantId });
  const [result, setResult] = useState<CreateDomainResult | null>(loadResult);
  const [nameServers, setNameServers] = useState<string[]>(loadResult()?.nameServers ?? []);
  const [domainVerified, setDomainVerified] = useState<boolean>(loadResult()?.domainVerified ?? false);
  const [isPrimary, setIsPrimary] = useState<boolean>(loadResult()?.isPrimary ?? false);
  const [makePrimary, setMakePrimaryState] = useState<boolean>(loadResult()?.makePrimary ?? true);
  const [runNonce, setRunNonce] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [location, setLocation] = useState(DEFAULT_AZURE_LOCATION);
  const [locations, setLocations] = useState<AzureLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  // A persisted result only counts if it matches the current NAME/DNS/subscription.
  const resultMatches = !!result && result.corpName === corpName && result.dnsName === dnsName && result.subscriptionId === subscriptionId;
  const resourcesDone = resultMatches;

  // Drop stale persisted state when the target changes.
  useEffect(() => {
    if (result && !resultMatches) {
      setNameServers([]);
      setDomainVerified(false);
      setIsPrimary(false);
      resetSteps();
    }
  }, [result, resultMatches, resetSteps]);

  const resourceGroupName = getCoreResourceGroupName(corpName);
  const lawName = getCoreLogAnalyticsName(corpName);

  /*
   * Once a subscription is known, check Graph directly for verified+primary status instead of
   * trusting localStorage, which won't reflect setup done on another device or by hand.
   */
  const [verifiedDomains, setVerifiedDomains] = useState<VerifiedDomain[]>([]);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [checkStatusError, setCheckStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!azureAccount || !subscriptionId || !corpName || !dnsName) return;
    let cancelled = false;
    setCheckingStatus(true);
    setCheckStatusError(null);
    getEntraDomain(azureAccount, dnsName, tenantId)
      .then(async (domain) => {
        if (cancelled || !domain) return;
        setDomainVerified(domain.isVerified);
        setIsPrimary(domain.isDefault);
        // Added but unverified: if the zone already holds Microsoft's TXT value, only Verify is left to do.
        if (!domain.isVerified) {
          const [expected, zone] = await Promise.all([
            getDomainVerificationTxt(azureAccount, dnsName, tenantId),
            findDnsZone(azureAccount, subscriptionId, dnsName, tenantId),
          ]);
          if (cancelled || !expected || !zone?.txtValues.includes(expected)) return;
          setNameServers(zone.nameServers);
          const r: CreateDomainResult = {
            corpName,
            dnsName,
            subscriptionId,
            nameServers: zone.nameServers,
            domainVerified: false,
            isPrimary: false,
            makePrimary,
          };
          setResult(r);
          saveResult(r);
          return;
        }
        if (domain.isDefault || !makePrimary) {
          const r: CreateDomainResult = {
            corpName,
            dnsName,
            subscriptionId,
            nameServers: [],
            domainVerified: true,
            isPrimary: domain.isDefault,
            makePrimary,
          };
          setResult(r);
          saveResult(r);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        /*
         * Consent errors are expected before Domain.ReadWrite.All has been granted —
         * don't surface or redirect here; run()/verify() prompt for consent on user action.
         */
        if (!isConsentError(msg)) setCheckStatusError(msg || "Failed to check domain status");
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, corpName, dnsName, tenantId, makePrimary]);

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

  // Load the subscription's available regions once an account + subscription are known.
  useEffect(() => {
    if (!azureAccount || !subscriptionId) {
      setLocations([]);
      return;
    }
    let cancelled = false;
    setLocationsLoading(true);
    setLocationsError(null);
    listLocations(azureAccount, subscriptionId, tenantId)
      .then((locs) => {
        if (!cancelled) setLocations(locs);
      })
      .catch((err) => {
        if (!cancelled) setLocationsError(err instanceof Error ? err.message : "Failed to load Azure regions");
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId]);

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

  // Redirects for AppRoleAssignment.ReadWrite.All incremental consent (granting DomainReadWriteAll to the pipeline's SP).
  const requestGrantConsent = useCallback(async () => {
    if (!azureAccount) return;
    const msal = await getMsal();
    if (!msal) return;
    await msal.acquireTokenRedirect({
      scopes: GRANT_CONSENT_SCOPES,
      account: azureAccount,
      authority: `https://login.microsoftonline.com/${tenantId || azureAccount.tenantId}`,
    });
  }, [azureAccount, tenantId]);

  const run = useCallback(async () => {
    if (!azureAccount || !subscriptionId || !corpName || !dnsName) return;
    setRunning(true);
    setVerifyError(null);

    const initialSteps: SetupStep[] = [
      { id: "consent", label: "Confirm Microsoft permissions", status: "pending" },
      { id: "providers", label: "Register required Azure resource providers", status: "pending" },
      { id: "rg", label: `Create resource group ${resourceGroupName}`, status: "pending" },
      { id: "law", label: `Create Log Analytics workspace ${lawName}`, status: "pending" },
      { id: "dns", label: `Create DNS zone ${dnsName}`, status: "pending" },
      { id: "domain", label: "Add custom domain to Entra ID", status: "pending" },
      { id: "txt", label: "Create domain-verification TXT record", status: "pending" },
      { id: "primary", label: "Set as primary domain", status: "pending" },
      // TODO: remove this step
      { id: "grant", label: "Grant domain permission to the pipeline", status: "pending" },
    ];
    setSteps(initialSteps);

    let currentStep = "consent";
    try {
      currentStep = "consent";
      updateStep("consent", "running");
      const graphScopes = [...new Set([...DOMAIN_SCOPES, ...GRANT_CONSENT_SCOPES, ...APP_SCOPES])];
      const promptedGraph = await ensureScopeConsent(azureAccount, graphScopes, tenantId);
      updateStep("consent", promptedGraph ? "done" : "skipped", promptedGraph ? undefined : "Already granted");

      currentStep = "providers";
      updateStep("providers", "running");
      const providers = await ensureRegistered(DNS_PROVIDERS);
      updateStep(
        "providers",
        providers.registered.length === 0 ? "skipped" : "done",
        providers.registered.length === 0 ? "Already registered" : providers.registered.join(", ")
      );

      currentStep = "rg";
      updateStep("rg", "running");
      const rg = await ensureResourceGroup(azureAccount, subscriptionId, resourceGroupName, location, tenantId);
      updateStep("rg", rg === "exists" ? "skipped" : "done", rg === "exists" ? "Already exists" : undefined);

      currentStep = "law";
      updateStep("law", "running");
      const law = await ensureLogAnalyticsWorkspace(azureAccount, subscriptionId, resourceGroupName, lawName, location, tenantId);
      updateStep("law", law.result === "exists" ? "skipped" : "done", law.result === "exists" ? "Already exists" : undefined);

      currentStep = "dns";
      updateStep("dns", "running");
      const zone = await ensureDnsZone(azureAccount, subscriptionId, resourceGroupName, dnsName, tenantId);
      setNameServers(zone.nameServers);
      updateStep("dns", zone.result === "exists" ? "skipped" : "done", zone.nameServers.join(", "));

      currentStep = "domain";
      updateStep("domain", "running");
      let domain = await getEntraDomain(azureAccount, dnsName, tenantId);
      if (domain) {
        updateStep("domain", "skipped", domain.isVerified ? "Already added and verified" : "Already added — not yet verified");
      } else {
        domain = await createEntraDomain(azureAccount, dnsName, tenantId);
        updateStep("domain", "done");
      }
      setDomainVerified(domain.isVerified);

      currentStep = "txt";
      if (domain.isVerified) {
        updateStep("txt", "skipped", "Domain already verified");
      } else {
        updateStep("txt", "running");
        const txtToken = await getDomainVerificationTxt(azureAccount, dnsName, tenantId);
        if (!txtToken) throw new Error("No TXT verification record returned by Microsoft Graph");
        const txt = await ensureDnsTxtRecord(azureAccount, subscriptionId, resourceGroupName, dnsName, txtToken, tenantId);
        updateStep("txt", txt === "exists" ? "skipped" : "done", txtToken);
      }

      currentStep = "primary";
      let primaryNow = domain.isDefault;
      if (!makePrimary) {
        updateStep("primary", "skipped", "Not selected");
      } else if (!domain.isVerified) {
        updateStep("primary", "skipped", "Set automatically after domain verification");
      } else if (domain.isDefault) {
        updateStep("primary", "skipped", "Already the primary domain");
        primaryNow = true;
      } else {
        updateStep("primary", "running");
        await setPrimaryEntraDomain(azureAccount, dnsName, tenantId);
        updateStep("primary", "done");
        primaryNow = true;
      }
      setIsPrimary(primaryNow);

      currentStep = "grant";
      if (!spClientId) {
        updateStep("grant", "skipped", "No app registration client id yet");
      } else {
        updateStep("grant", "running");
        const sp = await getExistingSP(azureAccount, spClientId, tenantId);
        if (!sp) throw new Error(`Service principal for app ${spClientId} not found — run the app registration card first`);
        const granted = await listAppRoleAssignments(azureAccount, sp.id, tenantId);
        if (granted.includes(GRAPH_PERMISSIONS.DomainReadWriteAll)) {
          updateStep("grant", "skipped", "Already granted");
        } else {
          await grantAdminConsent(azureAccount, sp.id, [GRAPH_PERMISSIONS.DomainReadWriteAll], tenantId);
          updateStep("grant", "done");
        }
      }

      const r: CreateDomainResult = {
        corpName,
        dnsName,
        subscriptionId,
        nameServers: zone.nameServers,
        domainVerified: domain.isVerified,
        isPrimary: primaryNow,
        makePrimary,
      };
      setResult(r);
      saveResult(r);
      setRunNonce((n) => n + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (isConsentError(msg)) {
        updateStep(currentStep, "error", "Additional consent required — redirecting to Microsoft...");
        const requestConsent = currentStep === "grant" ? requestGrantConsent : requestDomainConsent;
        await requestConsent().catch(() => updateStep(currentStep, "error", "Consent redirect failed — try again"));
      } else {
        updateStep(currentStep, "error", msg);
      }
    } finally {
      setRunning(false);
    }
  }, [
    azureAccount,
    subscriptionId,
    corpName,
    dnsName,
    spClientId,
    tenantId,
    makePrimary,
    location,
    resourceGroupName,
    lawName,
    setSteps,
    setRunning,
    updateStep,
    requestDomainConsent,
    requestGrantConsent,
    ensureRegistered,
  ]);

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

      if (result) {
        const r = { ...result, domainVerified: domain.isVerified, isPrimary: primary, makePrimary };
        setResult(r);
        saveResult(r);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setVerifyError(
        isConsentError(msg)
          ? "Additional consent required — run the setup once to grant it."
          : "Verification failed — make sure your registrar's NS records point to the Azure DNS name servers, then retry after DNS propagates."
      );
      if (!isConsentError(msg)) console.warn("[create-domain] verify failed:", msg);
    } finally {
      setVerifying(false);
    }
  }, [azureAccount, dnsName, tenantId, domainVerified, makePrimary, result]);

  // Also changed after setup, next to Verify, so it goes into the saved result straight away.
  const setMakePrimary = useCallback(
    (v: boolean) => {
      setMakePrimaryState(v);
      if (result) {
        const r = { ...result, makePrimary: v };
        setResult(r);
        saveResult(r);
      }
    },
    [result]
  );

  const reset = useCallback(() => {
    resetSteps();
    setResult(null);
    saveResult(null);
    setNameServers([]);
    setDomainVerified(false);
    setIsPrimary(false);
    setVerifyError(null);
  }, [resetSteps]);

  const done = domainVerified && (isPrimary || !makePrimary);
  const azureConfigured = !!AZURE_CLIENT_ID;
  // Assumes prerequisites are met — App locks this card (via cardRequirements) whenever they're not,
  // which overrides this status to "idle" regardless of what's computed here.
  const status: CardStatus = !azureConfigured ? "error" : done ? "complete" : "warning";
  const summary = !azureConfigured ? "Unavailable" : done ? (isPrimary ? "Domain verified and primary" : "Domain verified") : "Set up the corp domain";

  return {
    cardId: "create_domain" as const,
    verifiedDomains,
    checkingStatus,
    checkStatusError,
    location,
    setLocation,
    locations,
    locationsLoading,
    locationsError,
    steps,
    running,
    resourcesDone,
    resourceGroupName,
    lawName,
    nameServers,
    domainVerified,
    isPrimary,
    makePrimary,
    setMakePrimary,
    runNonce,
    verifying,
    verifyError,
    verify,
    run,
    reset,
    status,
    summary,
    cardRequirements: ["azure_login", "repo", "azure_subscription", "core_infra"],
    cardDependencyLabel: "Set up the corp domain",
    done,
  };
}
