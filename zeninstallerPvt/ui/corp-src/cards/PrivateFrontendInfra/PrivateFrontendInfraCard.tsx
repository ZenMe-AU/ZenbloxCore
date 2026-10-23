/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, Button, ButtonBase, Collapse, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { UsePrivateFrontendInfraCard } from "./usePrivateFrontendInfraCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import { EditableNameRow, PlainRow, SelectionRow } from "../../components/ResourceRows";
import ViewLink from "../../components/ViewLink";
import StatusText from "../../components/StatusText";
import { getAzureResourceUrl } from "../../logic/consoleUrls";
import { getPrivateInstallerAppName } from "../../logic/naming";
import { resourceGroupScope } from "../../api/azureArm";
import CloudVariableDetail from "../CloudVariableDetail";
import { PRIVATE_FRONTEND_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, GhEnv } from "../../types";

function Intro() {
  return (
    <Typography sx={{ typography: "body2", color: "text.secondary", lineHeight: 1.6 }}>
      Creates the Azure Storage and Microsoft Entra resources used to host and protect the private ZenInstaller site.
    </Typography>
  );
}

type Props = {
  card: CardChrome;
  infra: UsePrivateFrontendInfraCard;
  subscriptionId: string;
  tenantId?: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

export default function PrivateFrontendInfraCard({
  card,
  infra,
  subscriptionId,
  tenantId,
  githubAccount,
  repoName,
  selectedEnv,
  variables,
  githubUrl,
}: Props) {
  const [varExpanded, setVarExpanded] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingStorage, setEditingStorage] = useState(false);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const prevRunNonceRef = useRef(infra.runNonce);

  useEffect(() => {
    if (infra.runNonce === prevRunNonceRef.current) return;
    prevRunNonceRef.current = infra.runNonce;
    const t = setTimeout(() => {
      setAutoSaveCounter((c) => c + 1);
      setVarExpanded(true);
    }, 0);
    return () => clearTimeout(t);
  }, [infra.runNonce]);

  const rgUrl = subscriptionId ? getAzureResourceUrl(tenantId, resourceGroupScope(subscriptionId, infra.resourceGroupName)) : null;

  const populate =
    infra.result && infra.resultMatches
      ? {
          VITE_AZURE_CLIENT_ID: infra.result.installerClientId,
          SITE_STORAGE_ACCOUNT: infra.result.siteStorageAccount,
        }
      : undefined;

  return (
    <Card title="Frontend hosting environment" action={rgUrl ? <ViewLink href={rgUrl} /> : undefined} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />

        {infra.steps.length === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box>
              <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Resources</Typography>
              <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
                <PlainRow label="Resource group" value={infra.resourceGroupName} />
                <PlainRow label="Log Analytics" value={infra.lawName} />

                {/* Global to Azure, so it has to be changeable when another tenant already holds it. */}
                <EditableNameRow
                  label="Site storage account"
                  value={infra.siteStorageAccount}
                  onChange={infra.setSiteStorageAccount}
                  error={infra.siteStorageError}
                  checking={infra.siteStorageChecking}
                  check={infra.checkSiteStorageAccount}
                  editing={editingStorage}
                  setEditing={setEditingStorage}
                  width={200}
                />

                <PlainRow label="Sign-in app registration" value={getPrivateInstallerAppName()} />

                {/* Every resource above lands in this region, so it is chosen before the first run. */}
                <SelectionRow
                  label="Location"
                  name="Azure region"
                  value={infra.location}
                  onChange={infra.setLocation}
                  options={infra.locations.map((l) => ({ value: l.name, label: l.displayName }))}
                error={infra.locationsError ? "Couldn't load Azure region list — type the region name manually." : null}
                  loading={infra.locationsLoading}
                  placeholder="e.g. australiaeast"
                  editing={editingLocation}
                  setEditing={setEditingLocation}
                />
              </Box>
            </Box>

            <Button
              variant="contained"
              onClick={() => void infra.run()}
              disabled={infra.running || editingStorage || !infra.location.trim()}
              sx={{
                alignSelf: "flex-start",
                py: 0.85,
                px: 2.5,
              }}
            >
              {infra.done ? "Re-run setup" : "Create frontend hosting environment"}
            </Button>
          </Box>
        )}

        {infra.steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {infra.steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {infra.running && <StatusText>Running...</StatusText>}
            {!infra.running && (
              <Button
                size="small"
                onClick={infra.reset}
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

        {/* ── Divider (clickable toggle) ── */}
        <ButtonBase
          disableRipple
          onClick={() => setVarExpanded((expanded) => !expanded)}
          aria-expanded={varExpanded}
          aria-controls="private-frontend-connection-details"
          sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1.5, userSelect: "none", py: 0.25 }}
        >
          <Box sx={{ flex: 1, height: "1px", backgroundColor: "divider" }} />
          <Typography color="text.muted" sx={{ whiteSpace: "nowrap" }}>
            {varExpanded ? "collapse" : "open to enter connection detail"}
          </Typography>
          <KeyboardArrowDownIcon
            sx={{
              typography: "body2",
              color: "text.muted",
              transform: varExpanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
            aria-hidden="true"
          />
          <Box sx={{ flex: 1, height: "1px", backgroundColor: "divider" }} />
        </ButtonBase>

        {/* unmountOnExit=false keeps draft edits alive while collapsed */}
        <Collapse id="private-frontend-connection-details" role="region" aria-label="Connection details" in={varExpanded} timeout={300} unmountOnExit={false}>
          <CloudVariableDetail
            account={githubAccount}
            repo={repoName}
            envName={selectedEnv?.name ?? null}
            keys={PRIVATE_FRONTEND_KEYS}
            hiddenKeys={["SITE_STORAGE_ACCOUNT"]}
            variables={variables}
            populate={populate}
            title="Connection details"
            githubUrl={githubUrl}
            autoSaveCounter={autoSaveCounter}
          />
        </Collapse>
      </Box>
    </Card>
  );
}
