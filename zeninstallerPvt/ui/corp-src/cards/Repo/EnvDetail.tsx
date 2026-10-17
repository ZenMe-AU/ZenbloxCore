/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, ButtonBase, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockIcon from "@mui/icons-material/Lock";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Branch, GhEnv } from "../../types";
import { isValidEnvName } from "./env";
import EnvBranchDetail from "./EnvBranchDetail";
import RefreshButton from "../../components/RefreshButton";
import { useRefreshIndicator } from "../../hooks/util/useRefreshIndicator";
import { getEnvironmentsUrl, getEnvSettingsUrl } from "../../logic/github";
import ExternalLink from "../../components/ExternalLink";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  envList: GhEnv[];
  validEnvs: readonly string[];
  selectedEnv: GhEnv | null;
  onEnvChange: (env: GhEnv | null) => void;
  lockedByPR: boolean;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  loading: boolean;
  refreshFailed?: boolean;
  onRefresh: () => void;
  repoFullName: string | null;
  // Branch creation (shown when no branch matches the selected env)
  branches: Branch[];
  sourceBranch: string;
  onSourceBranchChange: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  onCreateBranch: (target: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnvDetail({
  envList,
  validEnvs,
  selectedEnv,
  onEnvChange,
  lockedByPR,
  branchMatchWarning,
  branchMatchError,
  loading,
  refreshFailed,
  onRefresh,
  repoFullName,
  branches,
  sourceBranch,
  onSourceBranchChange,
  creatingBranch,
  createBranchError,
  onCreateBranch,
}: Props) {
  const { refreshResult, markClicked } = useRefreshIndicator(loading, refreshFailed);

  const filteredEnvs = envList.filter((e) => isValidEnvName(e.name, validEnvs));
  // Show EnvBranchDetail only when the error is "no branch found" (not PR mismatch / multiple)
  const showBranchCreate = !!selectedEnv && !!branchMatchError && branchMatchError.startsWith("No branch found");
  // Always available once a repo is known — points at the specific env once one's picked, otherwise the environments list (e.g. to add a new one).
  const githubEnvironmentsUrl = repoFullName ? (selectedEnv ? getEnvSettingsUrl(repoFullName, selectedEnv.id) : getEnvironmentsUrl(repoFullName)) : null;

  return (
    <Box>
      {/* ── Environment selection ── */}

      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Pick the environment to configure.{" "}
          <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
            {validEnvs.join(", ")}
          </Box>{" "}
          are set up separately — everything below applies to the one you pick.
        </Typography>
        {!lockedByPR && (
          <RefreshButton
            busy={loading}
            result={refreshResult}
            sx={{ ml: 2 }}
            onClick={() => {
              markClicked();
              onRefresh();
            }}
          />
        )}
      </Box>

      {/* Env chips */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          py: 1,
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress aria-label="Loading GitHub environments" size={14} sx={{ color: "text.disabled" }} />
            <StatusText>Loading environments...</StatusText>
          </Box>
        ) : filteredEnvs.length === 0 ? (
          <Typography color="text.muted" role="status">
            No environment found, create one manually on GitHub.
          </Typography>
        ) : (
          <Box sx={{ display: !selectedEnv && lockedByPR ? "none" : "flex", gap: 1.5, flexWrap: "wrap" }}>
            {filteredEnvs.map((env) => {
              const isSelected = selectedEnv?.id === env.id;
              return (
                <ButtonBase
                  key={env.id}
                  disabled={lockedByPR}
                  onClick={() => !lockedByPR && onEnvChange(isSelected ? null : env)}
                  aria-pressed={isSelected}
                  aria-label={`${env.name}${isSelected && lockedByPR ? " from pull request" : ""}`}
                  sx={{
                    display: isSelected || !lockedByPR ? "inline-flex" : "none",
                    alignItems: "center",
                    gap: 0.75,
                    px: 2,
                    py: 0.75,
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: isSelected ? "primary.main" : "divider",
                    backgroundColor: isSelected ? "primary.main" : "background.paper",
                    color: isSelected ? "primary.contrastText" : "text.secondary",
                    fontWeight: isSelected ? 700 : 400,
                    userSelect: "none",
                    transition: "all 0.15s",
                    "&:hover": !lockedByPR
                      ? {
                          borderColor: isSelected ? "primary.dark" : "text.disabled",
                          backgroundColor: isSelected ? "primary.dark" : "background.default",
                        }
                      : {},
                  }}
                >
                  {isSelected && lockedByPR && <LockIcon aria-hidden="true" sx={{ fontSize: 13 }} />}
                  {env.name}
                  {isSelected && lockedByPR && (
                    <Typography component="span" sx={{ opacity: 0.75, ml: 0.25 }}>
                      from PR
                    </Typography>
                  )}
                </ButtonBase>
              );
            })}
          </Box>
        )}
        {githubEnvironmentsUrl && (
          <ExternalLink href={githubEnvironmentsUrl} label="Manage on GitHub">
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Manage on GitHub</Box>
              <OpenInNewIcon aria-hidden="true" sx={{ fontSize: 12 }} />
            </Box>
          </ExternalLink>
        )}
      </Box>

      {/* Branch match error */}
      {branchMatchError && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, my: 1.5 }}>
          <ErrorOutlineIcon aria-hidden="true" sx={{ fontSize: 14, color: "error.main", flexShrink: 0 }} />
          <ErrorText>{branchMatchError}</ErrorText>
        </Box>
      )}

      {/* Branch match warning */}
      {branchMatchWarning && (
        <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.75, my: 1.5 }}>
          <WarningAmberIcon aria-hidden="true" sx={{ fontSize: 14, color: "warning.main", flexShrink: 0 }} />
          <Typography color="warning.main">{branchMatchWarning}</Typography>
        </Box>
      )}

      {/* Create branch — only when the selected env has no matching branch */}
      {showBranchCreate && (
        <EnvBranchDetail
          targetBranch={selectedEnv!.name}
          branches={branches}
          sourceBranch={sourceBranch}
          onSourceBranchChange={onSourceBranchChange}
          creatingBranch={creatingBranch}
          createBranchError={createBranchError}
          onCreateBranch={onCreateBranch}
        />
      )}
    </Box>
  );
}
