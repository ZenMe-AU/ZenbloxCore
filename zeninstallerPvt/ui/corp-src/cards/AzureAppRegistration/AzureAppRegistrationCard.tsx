/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState, useEffect, useRef } from "react";
import { Box, Button, ButtonBase, Collapse, TextField, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, CardChrome, GhEnv } from "../../types";
import type { UseAzureAppRegistrationCard } from "./useAzureAppRegistrationCard";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ViewLink from "../../components/ViewLink";
import FieldLabel from "../../components/FieldLabel";
import StatusText from "../../components/StatusText";
import { AZURE_APP_REGISTRATIONS_URL, getAppRegistrationUrl } from "./consoleUrls";
import { AZURE_APP_KEYS } from "../../logic/variables";
import CloudVariableDetail from "../CloudVariableDetail";

type Props = {
  card: CardChrome;
  appReg: UseAzureAppRegistrationCard;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  subscriptionId: string;
  variables: UseGithubVariables;
  githubUrl?: string;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Create a Microsoft Entra app registration for GitHub Actions. ZenInstaller configures GitHub OIDC trust for the selected environment, so workflows can sign
      in without a stored client secret, and grants the app Reader access to the selected Azure subscription for Terraform plans. The app ID is saved to that
      environment. This does not grant deployment permissions; deployments are applied separately through the remote-terminal flow.
    </Typography>
  );
}

function Action({ clientId }: { clientId: string }) {
  return <ViewLink href={clientId ? getAppRegistrationUrl(clientId) : AZURE_APP_REGISTRATIONS_URL} />;
}

export default function AzureAppRegistrationCard({ card, appReg, githubAccount, repoName, selectedEnv, subscriptionId, variables, githubUrl }: Props) {
  const {
    azureAccount,
    appName,
    setAppName,
    setEnvironments,
    steps,
    result,
    runNonce,
    running,
    reset,
    run,
    prefillAppName,
    rbacStatus,
    rbacMissingRoles,
    planClientIdMismatch,
    onVariablesComplete,
  } = appReg;
  const disabled = card.locked;
  const [varExpanded, setVarExpanded] = useState(false);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const [bannerState, setBannerState] = useState<"none" | "saved" | "no-changes" | "error">("none");
  const prevRunNonceRef = useRef(runNonce);
  const prefilledNameRef = useRef(false);
  const varExpandedInitRef = useRef(false);

  const varHasAny = AZURE_APP_KEYS.some((k) => !!variables.values[k]);
  // App was created (persisted result) but doesn't exist in the currently selected tenant.
  const spNotFound = !!result && rbacStatus === "sp-not-found";
  // App exists in this tenant but its SP has no RBAC on the currently selected subscription.
  const rbacMissing = !!result && rbacStatus === "missing-role";

  // Action handlers that also dismiss the banner.
  const handleRetry = () => {
    setBannerState("none");
    reset();
  };
  const handleRun = () => {
    setBannerState("none");
    run();
  };

  // Keep environments in sync with the selected env from parent.
  useEffect(() => {
    if (selectedEnv?.name) setEnvironments([selectedEnv.name]);
  }, [selectedEnv?.name, setEnvironments]);

  // Trigger auto-save + expand after each successful run. Keyed on runNonce rather than `result`
  // becoming non-null, because a persisted result makes a re-run indistinguishable on reload.
  useEffect(() => {
    if (runNonce === prevRunNonceRef.current) return;
    prevRunNonceRef.current = runNonce;
    const t = setTimeout(() => {
      setAutoSaveCounter((c) => c + 1);
      setVarExpanded(true);
    }, 0);
    return () => clearTimeout(t);
  }, [runNonce]);

  // Reset per-env guards when the target env changes.
  useEffect(() => {
    prefilledNameRef.current = false;
    varExpandedInitRef.current = false;
  }, [selectedEnv?.name]);

  // Prefill App registration name from the saved client id (falls back silently if not found).
  useEffect(() => {
    if (prefilledNameRef.current || !azureAccount) return;
    const savedClientId = variables.values.AZURE_CLIENT_ID;
    if (!savedClientId) return;
    prefilledNameRef.current = true;
    void prefillAppName(savedClientId);
  }, [azureAccount, variables.values, prefillAppName]);

  // Auto-expand once, based on whether any saved value already exists — fires once the shared
  // cache has settled (already loaded, or just finished loading), not on every later edit.
  useEffect(() => {
    if (varExpandedInitRef.current) return;
    if (!githubAccount || !repoName || !selectedEnv?.name) return;
    if (variables.loading || variables.error) return;
    varExpandedInitRef.current = true;
    setVarExpanded(varHasAny);
  }, [variables.loading, variables.error, variables.values, githubAccount, repoName, selectedEnv?.name, varHasAny]);

  const populate = result ? { AZURE_CLIENT_ID: result.clientId, AZURE_PLAN_CLIENT_ID: result.clientId } : undefined;
  const keyErrors = spNotFound ? { AZURE_CLIENT_ID: "Not found in the selected tenant", AZURE_PLAN_CLIENT_ID: "Not found in the selected tenant" } : undefined;

  return (
    <Card title="Create an app registration in Azure" action={<Action clientId={appReg.spClientId} />} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* ── Result banner (shown after create+auto-save completes) ── */}
        {bannerState !== "none" && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              backgroundColor: "background.default",
              border: "1px solid",
              borderColor: bannerState === "error" ? "error.main" : "success.main",
              borderRadius: "8px",
              px: 1.5,
              py: 1,
            }}
            role={bannerState === "error" ? "alert" : "status"}
            aria-live={bannerState === "error" ? "assertive" : "polite"}
          >
            {bannerState === "error" ? (
              <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "error.main" }} />
            ) : (
              <CheckCircleOutlineIcon aria-hidden="true" sx={{ typography: "caption", color: "success.main" }} />
            )}
            <Typography color={bannerState === "error" ? "error.dark" : "success.dark"}>
              {bannerState === "saved" && "Connection details saved."}
              {bannerState === "no-changes" && "Connection details saved — no changes needed."}
              {bannerState === "error" && "Some connection details failed to save — check below."}
            </Typography>
          </Box>
        )}

        {/* ── App registration section ── */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Description — always visible */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Intro />
          </Box>

          {/* Requires the Azure sign-in from the Azure login card */}
          {azureAccount && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              {!subscriptionId && (
                <Box role="status" aria-live="polite" sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25 }}>
                  <Typography color="warning.dark">
                    Select a subscription in the <b>Azure subscription</b> card first. ZenInstaller grants this app Reader access to that subscription for Terraform planning.
                  </Typography>
                </Box>
              )}

              {spNotFound && (
                <Box
                  sx={{
                    backgroundColor: "background.default",
                    border: "1px solid",
                    borderColor: "warning.main",
                    borderRadius: 1,
                    px: 2,
                    py: 1.25,
                    display: "flex",
                    gap: 1,
                  }}
                  role="status"
                  aria-live="polite"
                >
                  <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "warning.main", flexShrink: 0 }} />
                  <Typography color="warning.dark">
                    This app registration doesn't exist in the selected tenant — create a new one.
                  </Typography>
                </Box>
              )}

              {rbacMissing && (
                <Box
                  sx={{
                    backgroundColor: "background.default",
                    border: "1px solid",
                    borderColor: "warning.main",
                    borderRadius: 1,
                    px: 2,
                    py: 1.25,
                    display: "flex",
                    gap: 1,
                  }}
                  role="status"
                  aria-live="polite"
                >
                  <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "warning.main", flexShrink: 0 }} />
                  <Typography color="warning.dark">
                    Missing on the selected subscription: <b>{rbacMissingRoles.join(", ") || "access"}</b> — re-run to grant it.
                  </Typography>
                </Box>
              )}

              {planClientIdMismatch && (
                <Box
                  sx={{
                    backgroundColor: "background.default",
                    border: "1px solid",
                    borderColor: "warning.main",
                    borderRadius: 1,
                    px: 2,
                    py: 1.25,
                    display: "flex",
                    gap: 1,
                  }}
                  role="status"
                  aria-live="polite"
                >
                  <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "warning.main", flexShrink: 0 }} />
                  <Typography color="warning.dark">
                    AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID — re-run to bring it back in sync.
                  </Typography>
                </Box>
              )}

              {/* App name + create button */}
              {steps.length === 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box>
                    <FieldLabel htmlFor="azure-app-registration-name">App registration name</FieldLabel>
                    <TextField
                      id="azure-app-registration-name"
                      size="small"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      sx={{ minWidth: 280 }}
                      inputProps={{ "data-sensitive": true }}
                    />
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                    <Button
                      variant="contained"
                      onClick={handleRun}
                      disabled={disabled || !subscriptionId || !appName.trim()}
                      sx={{
                        py: 0.85,
                        px: 2.5,
                      }}
                    >
                      {rbacMissing ? "Grant Reader access on this subscription" : "Create app registration"}
                    </Button>
                    {varHasAny && !rbacMissing && !spNotFound && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "warning.main" }} />
                        <Typography color="warning.main">This replaces the saved Azure app IDs for the selected GitHub environment.</Typography>
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
                      onClick={handleRetry}
                      sx={{
                        alignSelf: "flex-start",
                        mt: 0.5,
                        color: "text.muted",
                        "&:hover": { color: "primary.main" },
                      }}
                    >
                      ↩ Try again
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* ── Divider (clickable toggle) ── */}
        <ButtonBase
          disableRipple
          onClick={() => setVarExpanded((expanded) => !expanded)}
          aria-expanded={varExpanded}
          aria-controls="azure-app-registration-connection-details"
          sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1.5, userSelect: "none", py: 0.25 }}
        >
          <Box sx={{ flex: 1, height: "1px", backgroundColor: "divider" }} />
          <Typography color="text.muted" sx={{ whiteSpace: "nowrap" }}>
            {varExpanded ? "collapse" : "open to enter application connection detail"}
          </Typography>
          <KeyboardArrowDownIcon
            sx={{
              typography: "caption",
              color: "text.muted",
              transform: varExpanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
            aria-hidden="true"
          />
          <Box sx={{ flex: 1, height: "1px", backgroundColor: "divider" }} />
        </ButtonBase>

        {/* ── Variable editor (unmountOnExit=false keeps in-progress draft edits and auto-save state alive while collapsed) ── */}
        <Collapse id="azure-app-registration-connection-details" role="region" aria-label="Connection details" in={varExpanded} timeout={300} unmountOnExit={false}>
          <CloudVariableDetail
            account={githubAccount}
            repo={repoName}
            envName={selectedEnv?.name ?? null}
            keys={AZURE_APP_KEYS}
            variables={variables}
            populate={populate}
            title="Connection details"
            disabled={disabled}
            keyErrors={keyErrors}
            onComplete={onVariablesComplete}
            onAutoSaveResult={(result) => setBannerState(result)}
            githubUrl={githubUrl}
            autoSaveCounter={autoSaveCounter}
          />
        </Collapse>
      </Box>
    </Card>
  );
}
