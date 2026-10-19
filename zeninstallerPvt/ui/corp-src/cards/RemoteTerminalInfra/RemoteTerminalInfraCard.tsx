/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, Button, ButtonBase, CircularProgress, Collapse, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { UseRemoteTerminalInfraCard } from "./useRemoteTerminalInfraCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ViewLink from "../../components/ViewLink";
import ExternalLink from "../../components/ExternalLink";
import { getAdminConsentUrl, getAzureResourceUrl } from "../../logic/consoleUrls";
import { resourceGroupScope } from "../../api/azureArm";
import CloudVariableDetail from "../CloudVariableDetail";
import { DEPLOYMENT_TERMINAL_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, GhEnv } from "../../types";

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
          VITE_AZURE_CLIENT_ID: infra.result.installerClientId,
          VITE_APPINSIGHTS_CONNECTION_STRING: infra.result.appInsightsConnectionString,
        }
      : undefined;

  return (
    <Card title="Remote terminal environment" action={rgUrl ? <ViewLink href={rgUrl} /> : undefined} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          The relay behind the stage-card terminal: Web PubSub, the session table, and the Function App that issues group-scoped tokens. Everything connects by
          managed identity — no access key is stored.
        </Typography>

        {infra.steps.length === 0 && (
          <Box>
            <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Resources</Typography>
            <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              {[
                ["Resource group", infra.resourceGroupName],
                ["Log Analytics", infra.lawName],
                ["Application Insights", infra.appInsightsName],
                ["Storage account", infra.storageAccountName],
                ["Site storage account", infra.webStorageAccountName],
                ["Web PubSub", infra.webPubSubName],
                ["Hub", infra.hubName],
                ["Function App", infra.functionAppName],
                ["App registration", infra.pipelineAppName],
                ["Sign-in app registration", "Zeninstaller Private"],
              ].map(([label, value]) => (
                <Typography key={label} color="text.muted">
                  {label}:{" "}
                  <Box component="span" sx={{ color: "text.primary" }}>
                    {value}
                  </Box>
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        <Box>
          <Button
            onClick={() => void infra.run()}
            disabled={infra.running}
            variant="contained"
            size="small"
            aria-busy={infra.running}
            sx={{ py: 0.6, px: 2 }}
          >
            {infra.running ? (
              <Box component="span" role="status" aria-live="polite" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                <CircularProgress aria-label="Creating terminal relay" size={12} />
                Creating...
              </Box>
            ) : infra.done ? (
              "Re-run"
            ) : (
              "Create terminal relay"
            )}
          </Button>
        </Box>

        {infra.result && infra.resultMatches && (
          <Box>
            <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Admin consent</Typography>
            <Typography color="text.secondary" sx={{ mb: 0.5 }}>
              An administrator opens this once so everyone else can sign in without being prompted.
            </Typography>
            <ExternalLink
              href={getAdminConsentUrl(infra.result.pipelineTenantId, infra.result.installerClientId)}
              label="Admin consent"
            >
              {getAdminConsentUrl(infra.result.pipelineTenantId, infra.result.installerClientId)}
            </ExternalLink>
          </Box>
        )}

        {infra.steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {infra.steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
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
