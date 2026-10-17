/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { UseWebDeployCard } from "./useWebDeployCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ViewLink from "../../components/ViewLink";
import ExternalLink from "../../components/ExternalLink";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";
import { getWorkflowRunUrl, getWorkflowUrl } from "../../logic/github";
import CloudVariableDetail from "../CloudVariableDetail";
import { FRONTEND_VARIABLE_KEYS } from "../../logic/variables";
import { GITHUB_OAUTH_DOC } from "./config";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, GhEnv } from "../../types";
import type { CardChrome } from "../../types";

const when = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleString();

type Props = {
  card: CardChrome;
  web: UseWebDeployCard;
  repoFullName: string | null;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

export default function WebDeployCard({ card, web, repoFullName, githubAccount, repoName, selectedEnv, variables, githubUrl }: Props) {
  const {
    storageAccountName,
    siteUrl,
    latest,
    deployed,
    loadingLatest,
    loadingDeployed,
    building,
    build,
    buildWorkflow,
    updateAvailable,
    missingGithubClientId,
    staleVariables,
    error,
    steps,
    running,
    run,
  } = web;

  // Carries this page's query across so the site opens on the same repo and environment.
  const siteLink = siteUrl ? `${siteUrl}/${window.location.search}` : null;

  return (
    <Card
      title="Private Zeninstaller Frontend"
      action={
        repoFullName ? (
          // Before anything has built there is no run to point at, so the workflow's page stands in.
          <ViewLink href={latest ? getWorkflowRunUrl(repoFullName, latest.runId) : getWorkflowUrl(repoFullName, buildWorkflow)} />
        ) : undefined
      }
      {...card}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Builds the Zeninstaller frontend in GitHub Actions, then writes the files straight from this browser into the{" "}
          <Box component="code" sx={{ fontFamily: "monospace" }}>
            $web
          </Box>{" "}
          container of{" "}
          <Box component="code" sx={{ fontFamily: "monospace" }}>
            {storageAccountName || "the site's storage account"}
          </Box>
          .
        </Typography>

        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={FRONTEND_VARIABLE_KEYS}
          variables={variables}
          title="Build settings"
          githubUrl={githubUrl}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: -1 }}>
          <Typography color="text.muted">Where does this come from?</Typography>
          <ExternalLink href={GITHUB_OAUTH_DOC} label="Creating the GitHub OAuth app">
            Creating the GitHub OAuth app
          </ExternalLink>
        </Box>

        {staleVariables.length > 0 && (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <WarningAmberIcon aria-hidden="true" sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography color="warning.dark">
              Changed since the last build: {staleVariables.join(", ")} — build again to pick them up.
            </Typography>
          </Box>
        )}

        {missingGithubClientId && (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <WarningAmberIcon aria-hidden="true" sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography color="warning.dark">
              Set VITE_GITHUB_CLIENT_ID on this environment first — the build bakes it in.
            </Typography>
          </Box>
        )}

        <Box>
          <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Versions</Typography>
          <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography color="text.muted">
              Latest build:{" "}
              <Box component="span" sx={{ color: "text.primary", fontFamily: "monospace" }}>
                {loadingLatest ? "checking..." : latest ? `${latest.sha.slice(0, 7)} (v${latest.version}) · ${when(latest.builtAt)}` : "none yet"}
              </Box>
            </Typography>
            <Typography color="text.muted">
              Live on the site:{" "}
              <Box component="span" sx={{ color: "text.primary", fontFamily: "monospace" }}>
                {loadingDeployed
                  ? "checking..."
                  : deployed
                    ? `${deployed.sha.slice(0, 7)} (v${deployed.version}) · ${when(deployed.builtAt)}`
                    : "nothing deployed"}
              </Box>
            </Typography>
          </Box>
        </Box>

        {/* Until something is deployed the endpoint is a 404, so the link waits for it. */}
        {siteLink && deployed && (
          <Box>
            <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Continue in Zeninstaller Private</Typography>
            <ExternalLink href={siteLink} label="Zeninstaller Private site">
              <Box component="span" sx={{ wordBreak: "break-all" }}>{siteLink}</Box>
            </ExternalLink>
          </Box>
        )}

        {error && (
          <Box sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "error.light", borderRadius: 1, px: 2, py: 1.25 }}>
            <ErrorText>{error}</ErrorText>
          </Box>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            onClick={() => void build()}
            disabled={building || running || missingGithubClientId}
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
                <CircularProgress aria-label="Building frontend" size={12} sx={{ mr: 1 }} />
                Building...
              </>
            ) : (
              "Build"
            )}
          </Button>
          <Button
            onClick={() => void run()}
            disabled={!updateAvailable || running || building || missingGithubClientId}
            variant="contained"
            size="small"
            aria-busy={running}
          >
            {running ? (
              <>
                <CircularProgress aria-label="Deploying frontend" size={12} sx={{ mr: 1 }} />
                Deploying...
              </>
            ) : (
              "Deploy"
            )}
          </Button>

          {/* Mutually exclusive with the prompt below, so both share the slot by the button. */}
          {!loadingLatest && latest && !updateAvailable && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CheckCircleIcon aria-hidden="true" sx={{ fontSize: 14, color: "success.main" }} />
              <Typography color="success.dark">The site is serving the latest build.</Typography>
            </Box>
          )}

          {!loadingLatest && updateAvailable && deployed && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <WarningAmberIcon aria-hidden="true" sx={{ fontSize: 14, color: "warning.main" }} />
              <Typography color="warning.dark">Ready to deploy the new build</Typography>
            </Box>
          )}
        </Box>

        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {running && <StatusText>Deploying frontend...</StatusText>}
          </Box>
        )}
      </Box>
    </Card>
  );
}
