/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Collapse, IconButton, MenuItem, Select, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { UsePrivateFrontendInfraCard } from "./usePrivateFrontendInfraCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ViewLink from "../../components/ViewLink";
import { getAzureResourceUrl } from "../../logic/consoleUrls";
import { getPrivateInstallerAppName } from "../../logic/naming";
import { resourceGroupScope } from "../../api/azureArm";
import { labelSx } from "../../config/styles";
import CloudVariableDetail from "../CloudVariableDetail";
import { PRIVATE_FRONTEND_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, GhEnv } from "../../types";

function PlainRow({ label, value }: { label: string; value: string }) {
  return (
    <Typography sx={{ typography: "technicalBody", color: "text.muted" }}>
      {label}:{" "}
      <Box component="span" sx={{ color: "text.primary" }}>
        {value}
      </Box>
    </Typography>
  );
}

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
      Prepares Azure to host the private ZenInstaller site. It creates a resource group, monitoring workspace, site storage, and an Entra app registration for
      sign-in, then sends site activity and file changes to monitoring.
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
    <Card
      title="Frontend hosting environment"
      action={rgUrl ? <ViewLink href={rgUrl} label="Open frontend resource group in Azure" /> : undefined}
      lockedIntro={<Intro />}
      {...card}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />

        {infra.steps.length === 0 && (
          <Box>
            <Typography sx={{ ...labelSx, mb: 0.75 }}>Resources</Typography>
            <Box sx={{ borderLeft: "2px solid", borderLeftColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              <PlainRow label="Resource group" value={infra.resourceGroupName} />
              <PlainRow label="Log Analytics" value={infra.lawName} />

              {/* Global to Azure, so it has to be changeable when another tenant already holds it. */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minHeight: "1.6em" }}>
                <Typography sx={{ typography: "technicalBody", color: "text.muted" }}>Site storage account:</Typography>
                {editingStorage ? (
                  <>
                    <TextField
                      size="small"
                      value={infra.siteStorageAccount}
                      onChange={(e) => infra.setSiteStorageAccount(e.target.value)}
                      error={!!infra.siteStorageError}
                      helperText={infra.siteStorageError ?? undefined}
                      sx={{ width: 200 }}
                      className="corpTechnicalInput"
                    />
                    {/* Stays open until the name is one this installation can actually create or reuse. */}
                    <IconButton
                      size="small"
                      disabled={infra.siteStorageChecking}
                      onClick={() => void infra.checkSiteStorageAccount().then((ok) => ok && setEditingStorage(false))}
                      sx={{ color: "success.main", p: 0.25 }}
                    >
                      {infra.siteStorageChecking ? <CircularProgress size={12} /> : <CheckIcon sx={{ typography: "caption" }} />}
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography sx={{ typography: "technicalBody", color: "text.primary" }}>{infra.siteStorageAccount}</Typography>
                    <IconButton
                      size="small"
                      onClick={() => setEditingStorage(true)}
                      sx={{ color: "text.disabled", p: 0.25, "&:hover": { color: "primary.main" } }}
                    >
                      <EditIcon sx={{ typography: "caption" }} />
                    </IconButton>
                  </>
                )}
              </Box>

              <PlainRow label="Sign-in app registration" value={getPrivateInstallerAppName()} />

              {/* Every resource above lands in this region, so it is chosen before the first run. */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minHeight: "1.6em" }}>
                {editingLocation ? (
                  <>
                        <Typography sx={{ typography: "technicalBody", color: "text.muted" }}>Location:</Typography>
                    {infra.locations.length > 0 ? (
                      <Select
                        size="small"
                        value={infra.location}
                        onChange={(e) => infra.setLocation(e.target.value)}
                        sx={{ typography: "technicalBody", minWidth: 220, "& .MuiSelect-select": { py: 0.35 } }}
                      >
                        {infra.locations.map((l) => (
                          <MenuItem key={l.name} value={l.name} sx={{ typography: "technicalBody" }}>
                            {l.displayName}{" "}
                            <Box component="span" sx={{ color: "text.muted", ml: 0.5 }}>
                              ({l.name})
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <TextField
                        size="small"
                        value={infra.location}
                        onChange={(e) => infra.setLocation(e.target.value)}
                        placeholder={infra.locationsLoading ? "Loading regions..." : "e.g. australiaeast"}
                        sx={{ minWidth: 220 }}
                        className="corpTechnicalInput"
                      />
                    )}
                    {infra.locationsLoading && <CircularProgress size={12} />}
                    <IconButton size="small" onClick={() => setEditingLocation(false)} sx={{ color: "success.main", p: 0.25 }}>
                      <CheckIcon sx={{ typography: "caption" }} />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography sx={{ typography: "technicalBody", color: "text.muted" }}>
                      Location:{" "}
                        <Box component="span" sx={{ color: "text.primary" }}>
                        {infra.locations.find((l) => l.name === infra.location)?.displayName ?? infra.location}
                      </Box>
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setEditingLocation(true)}
                      sx={{ color: "text.disabled", p: 0.25, "&:hover": { color: "primary.main" } }}
                    >
                      <EditIcon sx={{ typography: "caption" }} />
                    </IconButton>
                  </>
                )}
              </Box>
            </Box>
          </Box>
        )}

        {infra.steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderLeftColor: "divider", pl: 1.5 }}>
            {infra.steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {infra.running && <Typography sx={{ typography: "caption", color: "text.muted", mt: 0.5 }}>Running...</Typography>}
          </Box>
        )}
        <ProcessRetryNotice started={infra.steps.length > 0} />

        <Box>
          <Button
            onClick={() => void infra.run()}
            disabled={infra.running}
            variant="contained"
            size="small"
          >
            {infra.running ? (
              <>
                <CircularProgress size={12} sx={{ mr: 1, color: "primary.light" }} />
                Creating...
              </>
            ) : infra.done ? (
              "Re-run"
            ) : (
              "Create terminal relay"
            )}
          </Button>
        </Box>

        {/* ── Divider (clickable toggle) ── */}
        <Box
          onClick={() => setVarExpanded((e) => !e)}
          sx={{ display: "flex", alignItems: "center", gap: 1.5, cursor: "pointer", userSelect: "none", py: 0.25 }}
        >
          <Box sx={{ flex: 1, height: "1px", background: "divider" }} />
          <Typography sx={{ typography: "body1", color: "text.muted", whiteSpace: "nowrap" }}>
            {varExpanded ? "collapse" : "open to enter connection detail"}
          </Typography>
          <KeyboardArrowDownIcon
            sx={{
              typography: "body2",
              color: "text.muted",
              transform: varExpanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          />
          <Box sx={{ flex: 1, height: "1px", background: "divider" }} />
        </Box>

        {/* unmountOnExit=false keeps draft edits alive while collapsed */}
        <Collapse in={varExpanded} timeout={300} unmountOnExit={false}>
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
