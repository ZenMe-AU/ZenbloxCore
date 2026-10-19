/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useRef, useState } from "react";
import { Box, Button, CircularProgress, Collapse, FormControlLabel, MenuItem, Select, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import BusinessIcon from "@mui/icons-material/Business";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PersonIcon from "@mui/icons-material/Person";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, Repo, RepoOption } from "../../types";
import RefreshButton from "../../components/RefreshButton";
import ErrorText from "../../components/ErrorText";
import { useRefreshIndicator } from "../../hooks/util/useRefreshIndicator";

// ─── Template status badge ────────────────────────────────────────────────────

type TemplateStatus = "checking" | "ready" | "not_clone";

const TEMPLATE_STATUS_CONFIG = {
  ready: { label: "Valid", color: "success" as const, icon: <CheckCircleIcon aria-hidden="true" sx={{ typography: "body2" }} /> },
  not_clone: { label: "Not a clone", color: "warning" as const, icon: <WarningAmberIcon aria-hidden="true" sx={{ typography: "body2" }} /> },
  checking: { label: "Checking...", color: "text.secondary" as const, icon: <CircularProgress aria-label="Checking template" size={12} /> },
} as const;

function TemplateBadge({ status }: { status: TemplateStatus }) {
  const cfg = TEMPLATE_STATUS_CONFIG[status];
  return (
    <Box
      sx={(theme) => {
        const color = cfg.color === "text.secondary" ? theme.palette.text.secondary : theme.palette[cfg.color].main;
        const backgroundColor = cfg.color === "text.secondary" ? theme.palette.background.default : alpha(color, 0.08);
        return {
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        borderRadius: "6px",
        backgroundColor,
        border: "1px solid",
        borderColor: alpha(color, 0.27),
        color,
        fontWeight: 600,
        whiteSpace: "nowrap",
        };
      }}
    >
      {cfg.icon}
      {cfg.label}
    </Box>
  );
}

const filterOptions = createFilterOptions<RepoOption>();

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  accounts: Account[];
  selectedAccount: Account | null;
  onAccountChange: (account: Account) => void;
  repos: Repo[];
  selectedRepo: RepoOption | null;
  onRepoChange: (repo: RepoOption | null) => void;
  templateStatus: TemplateStatus;
  templateName: string | null;
  defaultTemplateRepo: string;
  isPrivate: boolean;
  onIsPrivateChange: (v: boolean) => void;
  includeAllBranch: boolean;
  onIncludeAllBranchChange: (v: boolean) => void;
  cloning: boolean;
  cloneError: string | null;
  onClone: () => void;
  createEnvs: boolean;
  onCreateEnvsChange: (v: boolean) => void;
  cloneEnvWarning: string | null;
  repoLoading: boolean;
  repoRefreshFailed?: boolean;
  onRefresh: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Intro() {
  return (
    <Typography variant="body1" color="text.secondary">
      GitHub stores your configuration and settings. New repositories must be cloned from the supported template. GitHub Actions creates Terraform plans for
      review; deployment is applied through the remote terminal. Select a GitHub account and repository to continue.
    </Typography>
  );
}

export default function RepoDetail({
  accounts,
  selectedAccount,
  onAccountChange,
  repos,
  selectedRepo,
  onRepoChange,
  templateStatus,
  templateName,
  defaultTemplateRepo,
  isPrivate,
  onIsPrivateChange,
  includeAllBranch,
  onIncludeAllBranchChange,
  cloning,
  cloneError,
  onClone,
  createEnvs,
  onCreateEnvsChange,
  cloneEnvWarning,
  repoLoading,
  repoRefreshFailed,
  onRefresh,
}: Props) {
  const isNewRepo = selectedRepo?.isNew ?? false;
  const repoOptions: RepoOption[] = repos.map((r) => ({ id: r.id, name: r.name }));
  const [repoOpen, setRepoOpen] = useState(false);
  // Only set when the user aims at a row with arrows/mouse; MUI stays silent for its own auto-highlight.
  const aimedOption = useRef<RepoOption | null>(null);

  const commitTypedRepo = (typed: string) => {
    const exact = repos.find((r) => r.name.toLowerCase() === typed.toLowerCase());
    onRepoChange(exact ? { id: exact.id, name: exact.name } : { id: `new-${typed}`, name: typed, isNew: true });
    setRepoOpen(false);
  };

  const { refreshResult, markClicked } = useRefreshIndicator(repoLoading, repoRefreshFailed);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* ── Description + Refresh ── */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Intro />
        <RefreshButton
          busy={repoLoading}
          result={refreshResult}
          label="Refresh List"
          sx={{ ml: 2 }}
          onClick={() => {
            markClicked();
            onRefresh();
          }}
        />
      </Box>

      {/* ── Selectors row ── */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Org selector */}
        <Select
          size="small"
          value={selectedAccount ? String(selectedAccount.id) : ""}
          onChange={(e) => {
            const acc = accounts.find((a) => String(a.id) === e.target.value);
            if (acc) onAccountChange(acc);
          }}
          displayEmpty
          aria-label="GitHub account"
          sx={{ minWidth: 180 }}
        >
          {accounts.map((acc) => (
            <MenuItem key={acc.id} value={String(acc.id)}>
              <Box data-sensitive="true" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {acc.type === "User" ? <PersonIcon aria-hidden="true" sx={{ typography: "body1", color: "text.secondary" }} /> : <BusinessIcon aria-hidden="true" sx={{ typography: "body1", color: "text.secondary" }} />}
                {acc.login}
              </Box>
            </MenuItem>
          ))}
        </Select>

        {/* Repo autocomplete */}
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Autocomplete
            value={selectedRepo}
            onChange={(_, newVal) => {
              if (typeof newVal === "string") return;
              onRepoChange(newVal);
            }}
            filterOptions={(options, params) => {
              const typed = params.inputValue.trim();
              const filtered = filterOptions(options, params);
              if (!typed) return filtered;
              // Enter takes the first option: lead with the case-insensitive exact match, or "Clone as..." when there is none.
              const exact = options.find((o) => o.name.toLowerCase() === typed.toLowerCase());
              if (exact) return [exact, ...filtered.filter((o) => o.name !== exact.name)];
              return [{ id: `new-${typed}`, name: typed, isNew: true }, ...filtered];
            }}
            autoHighlight
            open={repoOpen}
            onOpen={() => setRepoOpen(true)}
            onClose={() => setRepoOpen(false)}
            onHighlightChange={(_, option) => {
              aimedOption.current = option;
            }}
            onInputChange={(_, __, reason) => {
              // Typing invalidates an earlier arrow-key aim.
              if (reason === "input") aimedOption.current = null;
            }}
            options={repoOptions}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
            isOptionEqualToValue={(o, v) => o.name === v.name}
            renderOption={({ key, ...props }, option) => (
              <Box key={key} component="li" {...props}>
                {option.isNew ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main" }}>
                    <AddIcon aria-hidden="true" sx={{ typography: "body1" }} />
                    Clone as &ldquo;{option.name}&rdquo;
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.primary" }}>
                    <Box aria-hidden="true" sx={{ typography: "caption", color: "text.muted" }}>▪</Box>
                    {option.name}
                  </Box>
                )}
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Select or type repo name..."
                size="small"
                className="corpTechnicalInput"
                onKeyDown={(e) => {
                  // A row the user aimed at wins; otherwise Enter decides from the typed text.
                  if (e.key !== "Enter" || aimedOption.current) return;
                  const typed = (e.target as HTMLInputElement).value.trim();
                  if (!typed) return;
                  e.preventDefault();
                  e.stopPropagation();
                  commitTypedRepo(typed);
                }}
              />
            )}
            size="small"
          />
        </Box>
      </Box>

      {/* ── Status row: badge + template name inline ── */}
      {selectedRepo && !isNewRepo && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <TemplateBadge status={templateStatus} />
          {templateName && (
            <>
              <Typography color="text.muted">origin template:</Typography>
              <Box
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: "4px",
                  backgroundColor: "background.default",
                  border: "1px solid",
                  borderColor: "divider",
                  color: "text.secondary",
                  typography: "technicalBody",
                }}
              >
                {templateName}
              </Box>
            </>
          )}
        </Box>
      )}

      {/* Not a clone warning */}
      {selectedRepo && !isNewRepo && templateStatus === "not_clone" && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            borderRadius: "8px",
            backgroundColor: "background.default",
            border: "1px solid",
            borderColor: "warning.light",
          }}
          role="status"
          aria-live="polite"
        >
          <WarningAmberIcon aria-hidden="true" sx={{ typography: "body1", color: "warning.light", flexShrink: 0 }} />
          <Typography color="warning.light">
            This repo is not a clone of the template. Only repos cloned from{" "}
            <Box component="span" sx={{ typography: "technicalBody", fontWeight: 600 }}>
              {defaultTemplateRepo}
            </Box>{" "}
            can be used.
          </Typography>
        </Box>
      )}

      {/* ── Clone panel ── */}
      <Collapse in={isNewRepo} sx={{ display: isNewRepo ? "block" : "none" }}>
        <Box sx={{ p: 2.5, border: "1px solid", borderColor: "primary.light", borderRadius: 1, backgroundColor: "background.default" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
            <Typography color="text.muted">Clone from template</Typography>
            <Typography color="primary.main" sx={{ fontWeight: 600 }}>
              {defaultTemplateRepo}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 4, mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isPrivate}
                  onChange={(e) => onIsPrivateChange(e.target.checked)}
                  size="small"
                  sx={{ "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "primary.light" } }}
                />
              }
              label={<Typography color="text.secondary">Private repository</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={includeAllBranch}
                  onChange={(e) => onIncludeAllBranchChange(e.target.checked)}
                  size="small"
                  sx={{ "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "primary.light" } }}
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography color="text.secondary">Clone all branches</Typography>
                  <Tooltip title="When enabled, all branches from the template will be copied. Otherwise only the default branch is cloned.">
                    <InfoOutlinedIcon aria-hidden="true" sx={{ typography: "body2", color: "text.muted" }} />
                  </Tooltip>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={createEnvs}
                  onChange={(e) => onCreateEnvsChange(e.target.checked)}
                  size="small"
                  sx={{ "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "primary.light" } }}
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography color="text.secondary">Create environments</Typography>
                  <Tooltip title="Automatically creates PROD and TEST GitHub environments in the new repo.">
                    <InfoOutlinedIcon aria-hidden="true" sx={{ typography: "body2", color: "text.muted" }} />
                  </Tooltip>
                </Box>
              }
            />
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A private repository is visible only to people with access. “Clone all branches” copies every template branch; otherwise only the default branch is
            copied. “Create environments” adds PROD and TEST to the new repository.
          </Typography>

          {cloneError && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                p: 1.25,
                borderRadius: "6px",
                backgroundColor: "background.default",
                border: "1px solid",
                borderColor: "error.light",
              }}
              role="alert"
              aria-live="assertive"
            >
              <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "body2", color: "error.main" }} />
              <ErrorText>{cloneError}</ErrorText>
            </Box>
          )}
          {cloneEnvWarning && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                p: 1.25,
                borderRadius: "6px",
                backgroundColor: "background.default",
                border: "1px solid",
                borderColor: "warning.light",
              }}
              role="status"
              aria-live="polite"
            >
              <WarningAmberIcon aria-hidden="true" sx={{ typography: "body2", color: "warning.light" }} />
              <Typography color="warning.light">{cloneEnvWarning}</Typography>
            </Box>
          )}
          <Button
            onClick={onClone}
            disabled={cloning}
            variant="contained"
            size="small"
            sx={{
              py: 0.75,
              px: 2.5,
            }}
          >
            {cloning ? (
              <>
                <CircularProgress aria-label="Cloning repository" size={12} sx={{ mr: 1 }} />
                Cloning...
              </>
            ) : (
              "Clone Repository"
            )}
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}
