/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, Button, ButtonBase, Collapse, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { UseRemoteTerminalInfraCard } from "./useRemoteTerminalInfraCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import { EditableNameRow, PlainRow, SelectionRow } from "../../components/ResourceRows";
import ViewLink from "../../components/ViewLink";
import StatusText from "../../components/StatusText";
import { getAzureResourceUrl } from "../../logic/consoleUrls";
import { resourceGroupScope } from "../../api/azureArm";
import CloudVariableDetail from "../CloudVariableDetail";
import { DEPLOYMENT_TERMINAL_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, GhEnv } from "../../types";

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
      The relay behind the stage-card terminal: Web PubSub, the session table, and the Function App that issues group-scoped tokens. Everything connects by
      managed identity — no access key is stored.
    </Typography>
  );
}

type Props = {
  card: CardChrome;
  infra: UseRemoteTerminalInfraCard;
  subscriptionId: string;
  tenantId?: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

export default function RemoteTerminalInfraCard({ card, infra, subscriptionId, tenantId, githubAccount, repoName, selectedEnv, variables, githubUrl }: Props) {
  const [varExpanded, setVarExpanded] = useState(false);
  const [editingStorage, setEditingStorage] = useState(false);
  const [editingWebPubSub, setEditingWebPubSub] = useState(false);
  const [editingFunctionApp, setEditingFunctionApp] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
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
          WEBPUBSUB_ENDPOINT: infra.result.webPubSubHost,
          WEBPUBSUB_CLIENT_ID: infra.result.pipelineClientId,
          WEBPUBSUB_TENANT_ID: infra.result.pipelineTenantId,
          VITE_API_URL: infra.result.apiUrl,
          VITE_APPINSIGHTS_CONNECTION_STRING: infra.result.appInsightsConnectionString,
          API_STORAGE_ACCOUNT: infra.result.storageAccountName,
        }
      : undefined;

  return (
    <Card title="Private Zeninstaller Backend Environment" action={rgUrl ? <ViewLink href={rgUrl} /> : undefined} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />

        {infra.steps.length === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box>
              <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Resources</Typography>
              <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
                <PlainRow label="Resource group" value={infra.resourceGroupName} />
                <PlainRow label="Log Analytics" value={infra.lawName} />
                <PlainRow label="Application Insights" value={infra.appInsightsName} />

                {/* These names are global to Azure, so they have to be changeable when another tenant already holds one. */}
                <EditableNameRow
                  label="Storage account"
                  value={infra.storageAccountName}
                  onChange={infra.setStorageAccount}
                  error={infra.storageError}
                  checking={infra.storageChecking}
                  check={infra.checkStorageAccount}
                  editing={editingStorage}
                  setEditing={setEditingStorage}
                  width={200}
                />
                <EditableNameRow
                  label="Web PubSub"
                  value={infra.webPubSubName}
                  onChange={infra.setWebPubSub}
                  error={infra.webPubSubError}
                  checking={infra.webPubSubChecking}
                  check={infra.checkWebPubSub}
                  editing={editingWebPubSub}
                  setEditing={setEditingWebPubSub}
                  width={300}
                />
                <PlainRow label="Hub" value={infra.hubName} />
                <EditableNameRow
                  label="Function App"
                  value={infra.functionAppName}
                  onChange={infra.setFunctionApp}
                  error={infra.functionAppError}
                  checking={infra.functionAppChecking}
                  check={infra.checkFunctionApp}
                  editing={editingFunctionApp}
                  setEditing={setEditingFunctionApp}
                  width={280}
                />
                <PlainRow label="Web PubSub app registration" value={infra.pipelineAppName} />
                {/* Every resource above lands in this region, so it is chosen before the first run. */}
                <SelectionRow
                  label="Location"
                  name="Azure region"
                  value={infra.location}
                  onChange={infra.setLocation}
                  options={infra.locations.map((l) => ({ value: l.name, label: l.displayName }))}
                  error={infra.locationsFailed ? "Couldn't load Azure region list — type the region name manually." : null}
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
              disabled={infra.running || editingStorage || editingWebPubSub || editingFunctionApp || !infra.location.trim()}
              sx={{
                alignSelf: "flex-start",
                py: 0.85,
                px: 2.5,
              }}
            >
              {infra.done ? "Re-run setup" : "Create backend environment"}
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
          aria-controls="remote-terminal-connection-details"
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
        <Collapse id="remote-terminal-connection-details" role="region" aria-label="Connection details" in={varExpanded} timeout={300} unmountOnExit={false}>
          <CloudVariableDetail
            account={githubAccount}
            repo={repoName}
            envName={selectedEnv?.name ?? null}
            keys={DEPLOYMENT_TERMINAL_KEYS}
            hiddenKeys={["API_STORAGE_ACCOUNT"]}
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
