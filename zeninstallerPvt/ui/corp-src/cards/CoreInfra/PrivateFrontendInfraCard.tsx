/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, ButtonBase, Collapse, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { UseFrontendPart } from "./useFrontendPart";
import type { UseBackendPart } from "./useBackendPart";
import CloudVariableDetail from "../CloudVariableDetail";
import { PRIVATE_FRONTEND_KEYS, DEPLOYMENT_TERMINAL_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, GhEnv } from "../../types";

const PRIVATE_KEYS = [...PRIVATE_FRONTEND_KEYS, ...DEPLOYMENT_TERMINAL_KEYS];

type Props = {
  frontend: UseFrontendPart;
  backend: UseBackendPart;
  subscriptionId: string;
  tenantId?: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

type ConnectionDetailsProps = Omit<Props, "subscriptionId" | "tenantId">;

// The private group's GitHub variables, at the bottom of the card. A finished run fills them in, saves them and opens the panel.
export function PrivateConnectionDetails({ frontend, backend, githubAccount, repoName, selectedEnv, variables, githubUrl }: ConnectionDetailsProps) {
  const [varExpanded, setVarExpanded] = useState(false);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const runNonce = frontend.runNonce + backend.runNonce;
  const prevRunNonceRef = useRef(runNonce);

  useEffect(() => {
    if (runNonce === prevRunNonceRef.current) return;
    prevRunNonceRef.current = runNonce;
    const t = setTimeout(() => {
      setAutoSaveCounter((c) => c + 1);
      setVarExpanded(true);
    }, 0);
    return () => clearTimeout(t);
  }, [runNonce]);

  const populate = {
    ...(frontend.result && frontend.resultMatches
      ? { VITE_AZURE_CLIENT_ID: frontend.result.installerClientId, SITE_STORAGE_ACCOUNT: frontend.result.siteStorageAccount }
      : {}),
    ...(backend.result && backend.resultMatches
      ? {
          WEBPUBSUB_ENDPOINT: backend.result.webPubSubHost,
          WEBPUBSUB_CLIENT_ID: backend.result.pipelineClientId,
          WEBPUBSUB_TENANT_ID: backend.result.pipelineTenantId,
          VITE_API_URL: backend.result.apiUrl,
          VITE_APPINSIGHTS_CONNECTION_STRING: backend.result.appInsightsConnectionString,
          API_STORAGE_ACCOUNT: backend.result.storageAccountName,
        }
      : {}),
  };

  return (
    <Box>
      {/* ── Divider (clickable toggle) ── */}
      <ButtonBase
        disableRipple
        onClick={() => setVarExpanded((expanded) => !expanded)}
        aria-expanded={varExpanded}
        aria-controls="private-hosting-connection-details"
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          userSelect: "none",
          py: 0.25,
          "&:hover .connection-toggle-label, &:focus-visible .connection-toggle-label": { color: "primary.main" },
          "&:hover .connection-toggle-line, &:focus-visible .connection-toggle-line": { backgroundColor: "primary.main" },
          "&:hover .connection-toggle-icon, &:focus-visible .connection-toggle-icon": { color: "primary.main" },
        }}
      >
        <Box className="connection-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
        <Typography className="connection-toggle-label" sx={{ typography: "body1", color: "text.muted", whiteSpace: "nowrap", transition: "color 0.2s" }}>
          {varExpanded ? "hide results" : "view results"}
        </Typography>
        <KeyboardArrowDownIcon
          className="connection-toggle-icon"
          sx={{
            typography: "body2",
            color: "text.muted",
            transform: varExpanded ? "rotate(180deg)" : "none",
            transition: "color 0.2s, transform 0.2s",
          }}
          aria-hidden="true"
        />
        <Box className="connection-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
      </ButtonBase>

      {/* unmountOnExit=false keeps draft edits alive while collapsed */}
      <Collapse id="private-hosting-connection-details" role="region" aria-label="Results saved to GitHub" in={varExpanded} timeout={300} unmountOnExit={false}>
        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={PRIVATE_KEYS}
          hiddenKeys={["SITE_STORAGE_ACCOUNT", "API_STORAGE_ACCOUNT"]}
          variables={variables}
          populate={Object.keys(populate).length ? populate : undefined}
          title="Results saved to GitHub"
          githubUrl={githubUrl}
          autoSaveCounter={autoSaveCounter}
        />
      </Collapse>
    </Box>
  );
}
