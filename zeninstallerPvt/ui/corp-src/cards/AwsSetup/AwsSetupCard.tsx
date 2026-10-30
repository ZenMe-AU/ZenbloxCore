/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// This card handles the setup of AWS IAM roles for GitHub Actions through OIDC.

import { useEffect, useRef, useState } from "react";
import { Box, Button, ButtonBase, CircularProgress, Collapse, TextField, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import Card from "../../components/Card";
import FieldLabel from "../../components/FieldLabel";
import ViewLink from "../../components/ViewLink";
import { getIamRoleUrl } from "./consoleUrls";
import CloudVariableDetail from ".././CloudVariableDetail";
import { AWS_VARIABLE_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { SetupStep, UseAwsSetupCard } from "./useAwsSetupCard";
import type { Account, CardChrome, GhEnv } from "../../types";

type Props = {
  card: CardChrome;
  awsSetup: UseAwsSetupCard;
  account: Account | null;
  repoName: string;
  repoFullName: string | null;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  onAwsValid?: (valid: boolean | null) => void;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Create an AWS IAM role trusted by GitHub Actions for the selected environment(s), using an immutable OIDC subject with numeric GitHub organization and
      repository IDs. GitHub Actions can then get temporary AWS credentials without storing access keys. The role receives the AWS-managed AdministratorAccess
      policy, which allows broad access to your AWS account. ZenInstaller saves the role ARN to the selected GitHub environment for deployment stages to use.
    </Typography>
  );
}

function Action({ roleName }: { roleName: string }) {
  if (!roleName) return null;
  return <ViewLink href={getIamRoleUrl(roleName)} />;
}

function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ typography: "caption", color: (theme) => theme.palette.success.main }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon sx={{ typography: "caption", color: (theme) => theme.palette.error.light }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} sx={{ color: (theme) => theme.palette.primary.main }} />
    ) : (
      <RadioButtonUncheckedIcon sx={{ typography: "caption", color: (theme) => theme.palette.card.icon.unavailable }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box>
        <Typography color={step.status === "error" ? "error.light" : "text.secondary"}>{step.label}</Typography>
        {step.detail && <Typography color="text.muted" sx={{ mt: 0.25 }}>{step.detail}</Typography>}
      </Box>
    </Box>
  );
}

export default function AwsSetupCard({ card, awsSetup, account, repoName, repoFullName, selectedEnv, variables, onAwsValid }: Props) {
  const [varExpanded, setVarExpanded] = useState(false);
  const [loadedVars, setLoadedVars] = useState<Record<string, string> | null>(null);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const [bannerState, setBannerState] = useState<"none" | "saved" | "no-changes" | "error">("none");
  const prevRoleArnRef = useRef<string | null>(null);
  const prefilledRoleRef = useRef(false);
  const githubUrl = repoFullName && selectedEnv ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit` : undefined;

  const { roleName, setRoleName, setEnvironments, loading, steps, roleArn, error, canCreate, create, resetRoleCreation } = awsSetup;

  const varHasAny = !!loadedVars && Object.keys(loadedVars).length > 0;

  useEffect(() => {
    if (selectedEnv?.name) setEnvironments([selectedEnv.name]);
  }, [selectedEnv?.name, setEnvironments]);

  useEffect(() => {
    prefilledRoleRef.current = false;
  }, [selectedEnv?.name]);

  useEffect(() => {
    if (prefilledRoleRef.current || roleArn) return;
    const savedArn = loadedVars?.[AWS_VARIABLE_KEYS[0]];
    const name = savedArn?.split("/").pop();
    if (name) {
      prefilledRoleRef.current = true;
      setRoleName(name);
    }
  }, [loadedVars, roleArn, setRoleName]);

  useEffect(() => {
    if (roleArn && !prevRoleArnRef.current) {
      const t = setTimeout(() => {
        setAutoSaveCounter((c) => c + 1);
        setVarExpanded(true);
      }, 0);
      prevRoleArnRef.current = roleArn;
      return () => clearTimeout(t);
    }
    prevRoleArnRef.current = roleArn ?? null;
  }, [roleArn]);

  const handleCreate = () => {
    setBannerState("none");
    create();
  };
  const handleRetry = () => {
    setBannerState("none");
    resetRoleCreation();
  };
  const populate = roleArn ? { [AWS_VARIABLE_KEYS[0]]: roleArn } : undefined;

  return (
    <Card title="AWS setup" action={<Action roleName={roleName} />} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />

        {bannerState !== "none" && (
          <Box
            role={bannerState === "error" ? "alert" : "status"}
            aria-live={bannerState === "error" ? "assertive" : "polite"}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              backgroundColor: (theme) => bannerState === "error" ? theme.palette.error.light + "14" : theme.palette.success.light + "1a",
              border: (theme) => `1px solid ${bannerState === "error" ? theme.palette.error.light : theme.palette.success.light}`,
              borderRadius: 1,
              px: 1.5,
              py: 1,
            }}
          >
            {bannerState === "error" ? (
              <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "error.light" }} />
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

        {steps.length === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <FieldLabel htmlFor="aws-iam-role-name">IAM role name</FieldLabel>
              <TextField
                id="aws-iam-role-name"
                size="small"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                sx={{ minWidth: 280 }}
                className="corpTechnicalInput"
                disabled={card.locked}
              />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Button
                variant="contained"
                onClick={handleCreate}
                disabled={card.locked || !canCreate}
                sx={{
                  py: 1,
                  px: 2.5,
                  boxShadow: (theme) => `0 2px 8px ${theme.palette.primary.main}33`,
                }}
              >
                Create IAM Role
              </Button>
              {varHasAny && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
                  <Typography color="warning.main">
                    This replaces the saved AWS role ARN for this GitHub environment. The role will have AdministratorAccess; if it already exists, its GitHub
                    trust policy will be updated.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: 2, borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {loading && <Typography role="status" aria-live="polite" color="text.muted" sx={{ mt: 0.5 }}>Running...</Typography>}
            {!loading && (
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

        {error && <Typography color="error.main" role="alert">{error}</Typography>}

        <ButtonBase
          id="aws-connection-details-toggle"
          aria-expanded={varExpanded}
          aria-controls="aws-connection-details"
          onClick={() => setVarExpanded((expanded) => !expanded)}
          sx={{ display: "flex", width: "100%", alignItems: "center", gap: 1.5, userSelect: "none", py: 0.25 }}
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
          />
          <Box sx={{ flex: 1, height: "1px", backgroundColor: "divider" }} />
        </ButtonBase>

        <Collapse id="aws-connection-details" role="region" aria-labelledby="aws-connection-details-toggle" in={varExpanded} timeout={300} unmountOnExit={false}>
          <CloudVariableDetail
            account={account}
            repo={repoName}
            envName={selectedEnv?.name ?? null}
            keys={AWS_VARIABLE_KEYS}
            variables={variables}
            populate={populate}
            title="Connection details"
            disabled={card.locked}
            onComplete={() => undefined}
            onAutoSaveResult={(result) => setBannerState(result)}
            onSaved={() => onAwsValid?.(null)}
            githubUrl={githubUrl}
            onLoaded={(saved) => {
              setLoadedVars(saved);
              setVarExpanded(Object.keys(saved).length > 0);
            }}
            autoSaveCounter={autoSaveCounter}
          />
        </Collapse>
      </Box>
    </Card>
  );
}
