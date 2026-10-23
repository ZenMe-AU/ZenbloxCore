/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import type { UseCreateDomainCard } from "./useCreateDomainCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import { PlainRow, SelectionRow } from "../../components/ResourceRows";
import ViewLink from "../../components/ViewLink";
import { AZURE_DNS_ZONES_URL, getAzureResourceUrl } from "../../logic/consoleUrls";
import { dnsZoneScope } from "../../api/azureArm";
import { getVariableDisplayName } from "../../logic/variables";
import { DNS_KEYS, CORE_RESOURCE_GROUP_KEYS } from "../../logic/variables";
import CloudVariableDetail from "../CloudVariableDetail";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, AzureAccount, GhEnv } from "../../types";

const CORE_DOMAIN_KEYS = [...DNS_KEYS, ...CORE_RESOURCE_GROUP_KEYS];

type Props = {
  card: CardChrome;
  createDomain: UseCreateDomainCard;
  azureAccount: AzureAccount | null;
  corpName: string;
  dnsName: string;
  subscriptionId: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

function Intro({ dnsName }: { dnsName: string }) {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Creates the DNS zone for <b>{dnsName || "your domain"}</b>, adds it to Entra ID as a custom domain, then verifies it and, if you choose, sets it as
      primary.
    </Typography>
  );
}

function PrimaryCheckbox({ checked, disabled, dnsName, onChange }: { checked: boolean; disabled: boolean; dnsName: string; onChange: (v: boolean) => void }) {
  return (
    <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 0.75, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ margin: 0, width: 14, height: 14 }} />
      <Typography component="span" color="text.muted">
        Set <b>{dnsName}</b> as the tenant's primary domain
      </Typography>
    </Box>
  );
}

function Action({ resourceId }: { resourceId: string | null }) {
  return <ViewLink href={resourceId ? getAzureResourceUrl(undefined, resourceId) : AZURE_DNS_ZONES_URL} />;
}

export default function CreateDomainCard({
  card,
  createDomain,
  azureAccount,
  corpName,
  dnsName,
  subscriptionId,
  githubAccount,
  repoName,
  selectedEnv,
  variables,
  githubUrl,
}: Props) {
  const {
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
    nameServers,
    verifiedDomains,
    domainVerified,
    isPrimary,
    makePrimary,
    setMakePrimary,
    runNonce,
    verifying,
    done,
    verifyError,
    verify,
    run,
    reset,
  } = createDomain;
  const disabled = card.locked;
  const [editingLocation, setEditingLocation] = useState(false);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const prevRunNonceRef = useRef(runNonce);

  // A finished run saves the zone's group straight away: stages read it from corp.env, not from here.
  useEffect(() => {
    if (runNonce === prevRunNonceRef.current) return;
    prevRunNonceRef.current = runNonce;
    const t = setTimeout(() => setAutoSaveCounter((c) => c + 1), 0);
    return () => clearTimeout(t);
  }, [runNonce]);

  const populate = resourcesDone ? { CORE_RESOURCE_GROUP: createDomain.resourceGroupName } : undefined;
  const missing: string[] = [];
  if (!corpName) missing.push(getVariableDisplayName("NAME"));
  if (!dnsName) missing.push(getVariableDisplayName("DNS"));
  const ready = !!azureAccount && missing.length === 0;

  return (
    <Card
      title="Core domain"
      action={
        <Action
          resourceId={
            createDomain.resourcesDone && subscriptionId && dnsName && corpName
              ? dnsZoneScope(subscriptionId, createDomain.resourceGroupName, dnsName)
              : null
          }
        />
      }
      lockedIntro={<Intro dnsName={dnsName} />}
      {...card}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro dnsName={dnsName} />

        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={CORE_DOMAIN_KEYS}
          hiddenKeys={CORE_RESOURCE_GROUP_KEYS}
          variables={variables}
          populate={populate}
          title="Core domain"
          githubUrl={githubUrl}
          autoSaveCounter={autoSaveCounter}
        />

        {/* Gating hints */}
        {!azureAccount && (
          <Box role="status" aria-live="polite" sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25 }}>
            <Typography color="warning.dark">Sign in with Azure first — this card reuses that session.</Typography>
          </Box>
        )}
        {azureAccount && missing.length > 0 && (
          <Box role="status" aria-live="polite" sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25 }}>
            <Typography color="warning.dark">
              Missing before setup can run: <b>{missing.join(", ")}</b>.
            </Typography>
          </Box>
        )}
        {checkStatusError && <ErrorText>Couldn't check existing setup: {checkStatusError}</ErrorText>}
        {/* Planned resources */}
        {ready && steps.length === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box>
              <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Resources</Typography>
              <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
                <PlainRow label="Resource group" value={createDomain.resourceGroupName} />
                <PlainRow label="Log Analytics" value={createDomain.lawName} />
                <SelectionRow
                  id="create-domain-location"
                  label="Location"
                  name="Azure region"
                  value={location}
                  onChange={setLocation}
                  options={locations.map((l) => ({ value: l.name, label: l.displayName }))}
                  error={locationsError ? "Couldn't load Azure region list — type the region name manually." : null}
                  loading={locationsLoading}
                  placeholder="e.g. australiaeast"
                  editing={editingLocation}
                  setEditing={setEditingLocation}
                />
                <PlainRow label="DNS zone" value={dnsName} />
                <PlainRow label="Custom domain" value={dnsName} />
              </Box>
            </Box>

            <PrimaryCheckbox checked={makePrimary} disabled={disabled} dnsName={dnsName} onChange={setMakePrimary} />

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Button
                variant="contained"
                onClick={run}
                disabled={disabled || running || !location.trim()}
                sx={{
                  py: 0.85,
                  px: 2.5,
                }}
              >
                {resourcesDone ? "Re-run setup" : "Set up core DNS domain"}
              </Button>
              {checkingStatus && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <CircularProgress aria-label="Checking domain setup" size={12} />
                  <StatusText>Checking whether this domain is already set up...</StatusText>
                </Box>
              )}
            </Box>
          </Box>
        )}
        {/* Progress steps */}
        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {running && <StatusText>Running...</StatusText>}
            {!running && (
              <Button
                size="small"
                onClick={reset}
                sx={{
                  alignSelf: "flex-start",
                  mt: 0.5,
                  color: "text.muted",
                  "&:hover": { color: "primary.main" },
                }}
              >
                ↩ Start over
              </Button>
            )}
          </Box>
        )}
        {verifiedDomains.length > 0 && (
          <Box>
            <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Verified domains in this tenant</Typography>
            <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              {verifiedDomains.map((d) => (
                <Typography key={d.name} color="text.primary">
                  {d.name}
                  {d.isDefault && (
                    <Box component="span" sx={{ color: "text.muted" }}>
                      {" "}
                      — primary
                    </Box>
                  )}
                  {d.isInitial && (
                    <Box component="span" sx={{ color: "text.muted" }}>
                      {" "}
                      — initial
                    </Box>
                  )}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Name servers + registrar instruction */}
        {nameServers.length > 0 && !domainVerified && (
          <Box
            sx={{
              backgroundColor: "background.default",
              border: "1px solid",
              borderColor: "info.main",
              borderRadius: 1,
              px: 2,
              py: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Typography color="info.dark" sx={{ fontWeight: 600 }}>Point your domain at Azure DNS</Typography>
            <Typography color="info.dark">
              At your domain registrar, replace the NS records for <b>{dnsName}</b> with the Azure name servers below. Microsoft can only verify the domain once
              DNS resolves through Azure.
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {nameServers.map((ns) => (
                <Typography key={ns} color="text.primary" sx={{ typography: "technical" }}>
                  {ns}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
        {/* Domain verification + primary promotion (one button drives both) */}
        {resourcesDone && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {done ? (
              <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <CheckCircleOutlineIcon aria-hidden="true" sx={{ typography: "caption", color: "success.main" }} />
                <Typography color="success.dark">
                  Domain <b>{dnsName}</b> is verified{isPrimary && " and set as the primary domain"}.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <PrimaryCheckbox checked={makePrimary} disabled={disabled || verifying} dnsName={dnsName} onChange={setMakePrimary} />
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                  <Button
                    variant="outlined"
                    onClick={verify}
                    disabled={disabled || verifying}
                    startIcon={verifying ? <CircularProgress size={12} /> : undefined}
                    sx={{
                      borderColor: "primary.light",
                      color: "primary.dark",
                      "&:hover": { borderColor: "primary.main", backgroundColor: "action.hover" },
                    }}
                  >
                    {domainVerified ? "Set as primary domain" : "Verify domain now"}
                  </Button>
                  {!domainVerified && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
                      <Typography color="warning.main">DNS propagation can take minutes to hours</Typography>
                    </Box>
                  )}
                </Box>
                {verifying && <StatusText>Verifying domain...</StatusText>}
                {verifyError && <ErrorText>{verifyError}</ErrorText>}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Card>
  );
}
