/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import type { UseBackendDeployCard } from "./useBackendDeployCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ViewLink from "../../components/ViewLink";
import { getWorkflowRunUrl, getWorkflowUrl } from "../../logic/github";
import ErrorText from "../../components/ErrorText";
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
      Builds the Zeninstaller backend in GitHub Actions, then pushes the package straight from this browser to{" "}
      <Box component="code" sx={{ typography: "body1" }}>
        {appName || "the Function App"}
      </Box>
      .
    </Typography>
  );
}

export default function BackendDeployCard({ card, backend, repoFullName }: Props) {
  const { appName, latest, deployed, loadingLatest, loadingDeployed, building, build, buildWorkflow, updateAvailable, error, steps, running, run } = backend;

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
              <Box component="span" sx={{ color: "text.primary", typography: "technical" }}>
                {loadingLatest ? "checking..." : latest ? `${latest.sha.slice(0, 7)} · ${when(latest.builtAt)}` : "none yet"}
              </Box>
            </Typography>
            <Typography color="text.muted">
              Live on the app:{" "}
              <Box component="span" sx={{ color: "text.primary", typography: "technical" }}>
                {loadingDeployed
                  ? "checking..."
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

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
            disabled={!updateAvailable || running || building}
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

          {/* Mutually exclusive with the prompt below, so both share the slot by the button. */}
          {!loadingLatest && latest && !updateAvailable && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CheckCircleIcon aria-hidden="true" sx={{ typography: "caption", color: "success.main" }} />
              <Typography color="success.dark">The Function App is running the latest build.</Typography>
            </Box>
          )}

          {!loadingLatest && updateAvailable && deployed && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
              <Typography color="warning.dark">Ready to deploy the new build</Typography>
            </Box>
          )}
        </Box>

        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
          </Box>
        )}
        <ProcessRetryNotice started={steps.length > 0} />
      </Box>
    </Card>
  );
}
