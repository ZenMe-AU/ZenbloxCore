/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState, type ReactNode } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTheme } from "@mui/material/styles";
import Card, { StatusIcon } from "../../components/Card";
import StepRow from "../StepRow";
import CloudVariableDetail from "../CloudVariableDetail";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ViewLink from "../../components/ViewLink";
import ExternalLink from "../../components/ExternalLink";
import ErrorText from "../../components/ErrorText";
import AzureAccessCheck from "../../components/AzureAccessCheck";
import CollapsiblePanel from "../../components/CollapsiblePanel";
import StatusText from "../../components/StatusText";
import { getWorkflowRunUrl, getWorkflowUrl } from "../../logic/github";
import { FRONTEND_VARIABLE_KEYS } from "../../logic/variables";
import { warningMessageIconSx } from "../../config/styles";
import { GITHUB_OAUTH_DOC } from "./config";
import { BACKEND_BUILD_WORKFLOW, WEB_BUILD_WORKFLOW, type UseBackendDeployCard, type UsePrivateZeninstallerCard, type UseWebDeployCard } from "./usePrivateZeninstallerCard";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { CardResourceAccess } from "../../hooks/util/useAzureCardAccess";
import type { Account, CardChrome, CardStatus, GhEnv } from "../../types";

const when = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleString();

// ─── Backend ──────────────────────────────────────────────────────────────────

type BackendProps = {
  backend: UseBackendDeployCard;
  repoFullName: string | null;
};

export function BackendDeployIntro({ appName }: { appName: string }) {
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

// The backend's workflow link, shown in its section header.
function BackendDeployAction({ backend, repoFullName }: BackendProps) {
  const { latest, failedBuildRunId } = backend;
  // Prefer the failed run when present; the latest successful build is not the run that needs attention.
  const workflowRunId = failedBuildRunId || latest?.runId;
  if (!repoFullName) return null;
  return (
    // Before anything has built there is no run to point at, so the workflow's page stands in.
    <ViewLink
      href={workflowRunId ? getWorkflowRunUrl(repoFullName, workflowRunId) : getWorkflowUrl(repoFullName, BACKEND_BUILD_WORKFLOW)}
      label={failedBuildRunId ? "Open failed backend workflow run" : latest ? "Open latest backend workflow run" : "Open backend workflow in GitHub"}
    />
  );
}

// The Backend section of the Private Zeninstaller card.
export function BackendDeploySection({ backend, appName }: Pick<BackendProps, "backend"> & { appName: string }) {
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);
  const { latest, deployed, loadingLatest, loadingDeployed, deployedUnavailable, building, build, updateAvailable, error, steps, running, run } = backend;

  return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <BackendDeployIntro appName={appName} />
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

        {(backend.managementAccess.status === "warning" || backend.managementAccess.status === "error") && (
          <CollapsiblePanel label="Prerequisites" id="backend-deploy-prerequisites" open={prerequisitesOpen} onToggle={() => setPrerequisitesOpen((open) => !open)}>
            <AzureAccessCheck access={backend.managementAccess} resourceAccess errorStyle={backend.accessNotice?.severity === "error"} />
          </CollapsiblePanel>
        )}
      </Box>
  );
}

// ─── Frontend ─────────────────────────────────────────────────────────────────

function SiteLink({ label, color, href }: { label: string; color: string; href: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography color={color}>{label}</Typography>
      <ExternalLink href={href} label="Zeninstaller Private site">
        <Box component="span" sx={{ wordBreak: "break-all" }}>{href}</Box>
      </ExternalLink>
    </Box>
  );
}

export function WebDeployIntro({ storageAccountName }: { storageAccountName: string }) {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
  GitHub Actions builds the ZenInstaller frontend. ZenInstaller downloads the build and uploads its files from this browser to the $web container in {storageAccountName || "the site's storage account"}. Build and deploy are separate, so you can review a build before publishing it.
</Typography>
  );
}

type WebProps = {
  web: UseWebDeployCard;
  storageAccountName: string;
  managementAccess: CardResourceAccess;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

// The frontend's workflow link, shown in its section header.
function WebDeployAction({ web, repoFullName }: { web: UseWebDeployCard; repoFullName: string | null }) {
  const { latest, failedBuildRunId } = web;
  // Prefer a failed run link over the last successful build's run link.
  const workflowRunId = failedBuildRunId || latest?.runId;
  if (!repoFullName) return null;
  return (
    // Before anything has built there is no run to point at, so the workflow's page stands in.
    <ViewLink
      href={workflowRunId ? getWorkflowRunUrl(repoFullName, workflowRunId) : getWorkflowUrl(repoFullName, WEB_BUILD_WORKFLOW)}
      label={failedBuildRunId ? "Open failed frontend workflow run" : latest ? "Open latest web workflow run" : "Open web workflow in GitHub"}
    />
  );
}

// The Frontend section of the Private Zeninstaller card.
export function WebDeploySection({ web, storageAccountName, managementAccess, githubAccount, repoName, selectedEnv, variables, githubUrl }: WebProps) {
  const {
    siteUrl,
    latest,
    deployed,
    loadingLatest,
    loadingDeployed,
    building,
    build,
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
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <WebDeployIntro storageAccountName={storageAccountName} />
        <AzureAccessCheck access={managementAccess} resourceAccess errorStyle={web.accessNotice?.severity === "error"} />

        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={FRONTEND_VARIABLE_KEYS}
          variables={variables}
          title="Build settings"
          githubUrl={githubUrl}
          keyHints={{
            VITE_GITHUB_CLIENT_ID: (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography color="text.muted">Where does this come from?</Typography>
                <ExternalLink href={GITHUB_OAUTH_DOC} label="Creating the GitHub OAuth app">
                  Creating the GitHub OAuth app
                </ExternalLink>
              </Box>
            ),
          }}
        />

        {staleVariables.length > 0 && (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
            <Typography color="warning.dark">
              Changed since the last build: {staleVariables.join(", ")} — build again to pick them up.
            </Typography>
          </Box>
        )}

        {missingGithubClientId && (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
            <Typography color="warning.dark">
              Set VITE_GITHUB_CLIENT_ID on this environment first — the build bakes it in.
            </Typography>
          </Box>
        )}

        <Box>
          <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Versions</Typography>
        {/* Wait for build and deployment reads so an incomplete comparison cannot expose stale actions or status. */}
          <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography color="text.muted">
              Latest build:{" "}
              <Box component="span" sx={{ color: "text.primary", typography: "technicalBody" }}>
                {loadingLatest ? "checking..." : latest ? `${latest.sha.slice(0, 7)} (v${latest.version}) · ${when(latest.builtAt)}` : "none yet"}
              </Box>
            </Typography>
            <Typography color="text.muted">
              Live on the site:{" "}
              <Box component="span" sx={{ color: "text.primary", typography: "technicalBody" }}>
                {loadingDeployed
                  ? "checking..."
                  : deployed
                    ? `${deployed.sha.slice(0, 7)} (v${deployed.version}) · ${when(deployed.builtAt)}`
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

        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Button
            onClick={() => void build()}
            disabled={loadingLatest || building || running || missingGithubClientId}
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
            disabled={!updateAvailable || loadingLatest || loadingDeployed || running || building || missingGithubClientId || managementAccess.status !== "ready"}
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

          {web.showReady && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
              <Typography color="warning.dark">Ready to deploy the new build</Typography>
            </Box>
          )}
        </Box>

        {/* Only show a stable deployment result after reads and operations finish; the endpoint link can remain visible meanwhile. */}
        {web.showCurrent ? (
          <Box sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "success.light", borderRadius: 1, px: 2, py: 1.25 }}>
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CheckCircleIcon aria-hidden="true" sx={{ typography: "body2", color: "success.main" }} />
              <Typography color="success.dark">The site is serving the latest build.</Typography>
            </Box>
            {siteLink && (
              <Box sx={{ mt: 0.75 }}>
                <SiteLink label="Click the link below to continue in your own private Zeninstaller:" color="success.dark" href={siteLink} />
              </Box>
            )}
          </Box>
        ) : (
          siteLink && <SiteLink label="The private Zeninstaller endpoint is available at:" color="text.muted" href={siteLink} />
        )}

        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {running && <StatusText>Deploying frontend...</StatusText>}
          </Box>
        )}
        <ProcessRetryNotice started={steps.length > 0} />
      </Box>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

type DeploySection = {
  id: string; // Also the section's element id, as card-<id>.
  title: string;
  status: CardStatus;
  summary?: string;
  action?: ReactNode; // Shown beside the section title.
  intro: ReactNode; // Also shown while the whole card is locked.
  content: ReactNode;
};

type Props = Omit<WebProps, "web" | "storageAccountName" | "managementAccess"> & {
  card: CardChrome;
  zeninstaller: Pick<UsePrivateZeninstallerCard, "backend" | "web" | "appName" | "storageAccountName" | "managementAccess">;
  repoFullName: string | null;
};

function Section({ id, title, status, summary, action, content }: DeploySection) {
  const colors = useTheme().vars.palette.card;
  const titleId = `section-title-${id}`;

  return (
    <Box component="section" id={`card-${id}`} aria-labelledby={titleId} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Typography component="h4" id={titleId} sx={{ typography: "body1", fontWeight: 600, m: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 1.25, rowGap: 0.25 }}>
          <Box component="span" sx={{ display: "flex", alignSelf: "center" }}>
            <StatusIcon status={status} locked={false} iconColors={colors.icon} lockedIconColor={colors.lockedIcon} />
          </Box>
          <span>{title}</span>
          {summary && (
            <Box component="span" sx={{ fontWeight: 400, color: colors.summary[status], overflowWrap: "anywhere" }}>
              {summary}
            </Box>
          )}
        </Typography>
        {action}
      </Box>
      {content}
    </Box>
  );
}

// One card over several deploy sections, stacked and divided.
export default function PrivateZeninstallerCard({ card, zeninstaller, repoFullName, ...github }: Props) {
  const { backend, web, appName, storageAccountName, managementAccess } = zeninstaller;
  const sections: DeploySection[] = [
    {
      id: "backend_deploy", title: "Backend", status: backend.status, summary: backend.summary,
      action: <BackendDeployAction backend={backend} repoFullName={repoFullName} />,
      intro: <BackendDeployIntro appName={appName} />,
      content: <BackendDeploySection backend={backend} appName={appName} />,
    },
    {
      id: "web_deploy", title: "Frontend", status: web.status, summary: web.summary,
      action: <WebDeployAction web={web} repoFullName={repoFullName} />,
      intro: <WebDeployIntro storageAccountName={storageAccountName} />,
      content: <WebDeploySection web={web} storageAccountName={storageAccountName} managementAccess={managementAccess} {...github} />,
    },
  ];
  const intros = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {sections.map((section) => (
        <Box key={section.id}>{section.intro}</Box>
      ))}
    </Box>
  );

  return (
    <Card title="Private Zeninstaller" lockedIntro={intros} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3, "& > section + section": { borderTop: "1px solid", borderColor: "divider", pt: 3 } }}>
        {sections.map((section) => (
          <Section key={section.id} {...section} />
        ))}
      </Box>
    </Card>
  );
}
