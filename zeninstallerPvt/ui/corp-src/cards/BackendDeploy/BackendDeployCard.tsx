/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, ButtonBase, CircularProgress, Collapse, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import type { UseBackendDeployCard } from "./useBackendDeployCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ViewLink from "../../components/ViewLink";
import { getWorkflowRunUrl, getWorkflowUrl } from "../../logic/github";
import ErrorText from "../../components/ErrorText";
import ResourceGroupCreationAccess from "../../components/ResourceGroupCreationAccess";
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
  const { appName, latest, deployed, loadingLatest, loadingDeployed, deployedUnavailable, building, build, buildWorkflow, updateAvailable, error, steps, running, run } = backend;

  return (
    <Card
      title="Private Zeninstaller Backend"
      action={
        repoFullName ? (
          // Before anything has built there is no run to point at, so the workflow's page stands in.
          <ViewLink
            href={latest ? getWorkflowRunUrl(repoFullName, latest.runId) : getWorkflowUrl(repoFullName, buildWorkflow)}
            label={latest ? "Open latest backend workflow run" : "Open backend workflow in GitHub"}
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

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Button
            onClick={() => void build()}
            disabled={building || running}
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
            disabled={!updateAvailable || running || building || backend.managementAccess.status !== "ready"}
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

          {backend.managementAccess.status === "error" && (
            <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <ErrorOutlineIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "error.main" }} />
              <Typography color="error.main">Insufficient permissions to deploy</Typography>
            </Box>
          )}

          {/* Mutually exclusive with the prompt below, so both share the slot by the button. */}
          {!loadingLatest && !deployedUnavailable && latest && !updateAvailable && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CheckCircleIcon aria-hidden="true" sx={{ typography: "body2", color: "success.main" }} />
              <Typography color="success.dark">The Function App is running the latest build.</Typography>
            </Box>
          )}

          {!loadingLatest && !deployedUnavailable && updateAvailable && deployed && (
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
          <Box sx={{ minWidth: 0 }}>
            <ButtonBase
              disableRipple
              onClick={() => setPrerequisitesOpen((open) => !open)}
              aria-expanded={prerequisitesOpen}
              aria-label={prerequisitesOpen ? "Collapse prerequisites" : "View prerequisites"}
              aria-controls="backend-deploy-prerequisites"
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                userSelect: "none",
                py: 0.25,
                "&:hover .prerequisites-toggle-label, &:focus-visible .prerequisites-toggle-label": { color: "primary.main" },
                "&:hover .prerequisites-toggle-line, &:focus-visible .prerequisites-toggle-line": { backgroundColor: "primary.main" },
                "&:hover .prerequisites-toggle-icon, &:focus-visible .prerequisites-toggle-icon": { color: "primary.main" },
              }}
            >
              <Box className="prerequisites-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
              <Typography className="prerequisites-toggle-label" color="text.muted" sx={{ whiteSpace: "nowrap", transition: "color 0.2s" }}>
                {prerequisitesOpen ? "hide prerequisites" : "view prerequisites"}
              </Typography>
              <KeyboardArrowDownIcon
                className="prerequisites-toggle-icon"
                sx={{
                  typography: "caption",
                  color: "text.muted",
                  transform: prerequisitesOpen ? "rotate(180deg)" : "none",
                  transition: "color 0.2s, transform 0.2s",
                }}
                aria-hidden="true"
              />
              <Box className="prerequisites-toggle-line" sx={{ flex: 1, height: "1px", backgroundColor: "divider", transition: "background-color 0.2s" }} />
            </ButtonBase>
            <Collapse in={prerequisitesOpen} timeout={300}>
              <Box id="backend-deploy-prerequisites" role="region" aria-label="Prerequisites" sx={{ mt: 0.5 }}>
                <ResourceGroupCreationAccess access={backend.managementAccess} resourceAccess errorStyle />
              </Box>
            </Collapse>
          </Box>
        )}
      </Box>
    </Card>
  );
}
