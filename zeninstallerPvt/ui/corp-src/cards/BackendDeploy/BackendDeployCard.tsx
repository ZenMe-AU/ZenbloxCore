/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import type { UseBackendDeployCard } from "./useBackendDeployCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ViewLink from "../../components/ViewLink";
import { getWorkflowRunUrl, getWorkflowUrl } from "../../logic/github";
import ErrorText from "../../components/ErrorText";
import AzureAccessCheck from "../../components/AzureAccessCheck";
import Prerequisites from "../../components/Prerequisites";
import type { CardChrome } from "../../types";

const when = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleString();

type Props = {
  card: CardChrome;
  backend: UseBackendDeployCard;
  repoFullName: string | null;
};

function Intro({ appName }: { appName: string }) {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
      GitHub Actions builds the ZenInstaller backend. ZenInstaller downloads that build and deploys it from this browser to{" "}
      <Box component="code" sx={{ typography: "body1" }}>
        {appName || "the Function App"}
      </Box>
      . You can check which build is live before deploying an update.
    </Typography>
  );
}

export default function BackendDeployCard({ card, backend, repoFullName }: Props) {
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);
  const { appName, latest, deployed, loadingLatest, loadingDeployed, deployedUnavailable, building, build, buildWorkflow, updateAvailable, error, failedBuildRunId, steps, running, run } = backend;
  // Prefer the failed run when present; the latest successful build is not the run that needs attention.
  const workflowRunId = failedBuildRunId || latest?.runId;

  return (
    <Card
      title="Private Zeninstaller Backend"
      action={
        repoFullName ? (
          // Before anything has built there is no run to point at, so the workflow's page stands in.
          <ViewLink
            href={workflowRunId ? getWorkflowRunUrl(repoFullName, workflowRunId) : getWorkflowUrl(repoFullName, buildWorkflow)}
            label={failedBuildRunId ? "Open failed backend workflow run" : latest ? "Open latest backend workflow run" : "Open backend workflow in GitHub"}
          />
        ) : undefined
      }
      lockedIntro={<Intro appName={appName} />}
      {...card}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro appName={appName} />
        <Box>
          <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Versions</Typography>
          <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography color="text.muted">
              Latest build:{" "}
              <Box component="span" sx={{ color: "text.primary", typography: "technicalBody" }}>
                {loadingLatest ? "checking..." : latest ? `${latest.sha.slice(0, 7)} · ${when(latest.builtAt)}` : "none yet"}
              </Box>
            </Typography>
            <Typography color="text.muted">
              Live on the app:{" "}
              <Box component="span" sx={{ color: "text.primary", typography: "technicalBody" }}>
                {loadingDeployed
                  ? "checking..."
                  : deployedUnavailable
                    ? "unavailable"
                    : deployed
                      ? `${deployed.sha.slice(0, 7)}${deployed.deployedAt ? ` · ${when(deployed.deployedAt)}` : ""}`
                      : "nothing deployed"}
              </Box>
            </Typography>
          </Box>
        </Box>

        {error && (
          <Box sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "error.light", borderRadius: 1, px: 2, py: 1.25 }}>
            <ErrorText>{error}</ErrorText>
          </Box>
        )}

        {/* Wait for both version reads before enabling actions so initial null state is not mistaken for current state. */}
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Button
            onClick={() => void build()}
            disabled={loadingLatest || building || running}
            variant="outlined"
            size="small"
            aria-busy={building}
            sx={{
              borderColor: "primary.light",
              color: "primary.dark",
              "&:hover": { borderColor: "primary.main", backgroundColor: "action.hover" },
            }}
          >
            {building ? (
              <>
                <CircularProgress aria-label="Building backend" size={12} sx={{ mr: 1 }} />
                Building...
              </>
            ) : (
              "Build"
            )}
          </Button>
          <Button
            onClick={() => void run()}
            disabled={!updateAvailable || loadingLatest || loadingDeployed || running || building || backend.managementAccess.status !== "ready"}
            variant="contained"
            size="small"
            aria-busy={running}
          >
            {running ? (
              <>
                <CircularProgress aria-label="Deploying backend" size={12} sx={{ mr: 1 }} />
                Deploying...
              </>
            ) : (
              "Deploy"
            )}
          </Button>

          {backend.accessNotice && (
            <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {backend.accessNotice.severity === "error" ? (
                <ErrorOutlineIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "error.main" }} />
              ) : (
                <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
              )}
              <Typography color={backend.accessNotice.severity === "error" ? "error.main" : "warning.dark"}>{backend.accessNotice.summary}</Typography>
            </Box>
          )}

          {/* Show stable version guidance only; errors, active work, and incomplete reads take precedence. */}
          {backend.showCurrent && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CheckCircleIcon aria-hidden="true" sx={{ typography: "body2", color: "success.main" }} />
              <Typography color="success.dark">The Function App is running the latest build.</Typography>
            </Box>
          )}

          {backend.showReady && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
              <Typography color="warning.dark">Ready to deploy the new build</Typography>
            </Box>
          )}
        </Box>

        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
          </Box>
        )}
        <ProcessRetryNotice started={steps.length > 0} />

        {(backend.managementAccess.status === "checking" || backend.managementAccess.status === "error") && (
          <Prerequisites id="backend-deploy-prerequisites" open={prerequisitesOpen} onToggle={() => setPrerequisitesOpen((open) => !open)}>
            <AzureAccessCheck access={backend.managementAccess} resourceAccess errorStyle={backend.accessNotice?.severity === "error"} />
          </Prerequisites>
        )}
      </Box>
    </Card>
  );
}
