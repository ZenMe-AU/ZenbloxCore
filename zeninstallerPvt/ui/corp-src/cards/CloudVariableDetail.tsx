/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { Account } from "../types";
import type { UseGithubVariables } from "../hooks/useGithubVariables";
import VariablesCard from "../components/VariablesCard";
import ExternalLink from "../components/ExternalLink";
import RefreshButton from "../components/RefreshButton";
import SaveButton from "../components/SaveButton";
import { useVariableEditor } from "../hooks/util/useVariableEditor";
import { useRefreshIndicator } from "../hooks/util/useRefreshIndicator";

type Props = {
  account: Account | null;
  repo: string;
  envName: string | null;
  keys: readonly string[];
  // Saved and counted like the rest, but never shown — values the card derives, not ones anyone types.
  hiddenKeys?: readonly string[];
  variables: UseGithubVariables;
  populate?: Record<string, string>;
  title?: string;
  disabled?: boolean;
  onComplete?: (done: boolean) => void;
  githubUrl?: string;
  saveHint?: ReactNode; // Rendered next to the Save button (e.g. an "unsaved change" warning).
  keyErrors?: Partial<Record<string, string>>; // Per-key external validation error, shown as a row-level error icon.
  autoSaveCounter?: number; // Increment to auto-apply populate values and immediately save them to GitHub.
  onAutoSaveResult?: (result: "saved" | "no-changes" | "error") => void; // Called when auto-save (triggered by autoSaveCounter) completes.
  onLoaded?: (saved: Record<string, string>) => void;
  onSaved?: (keys: string[]) => void;
};

export default function CloudVariableDetail({
  account,
  repo,
  envName,
  keys,
  hiddenKeys,
  variables,
  populate,
  title = "Variables",
  disabled,
  onComplete,
  githubUrl,
  saveHint,
  keyErrors,
  autoSaveCounter,
  onAutoSaveResult,
  onLoaded,
  onSaved,
}: Props) {
  const { refreshResult, markClicked } = useRefreshIndicator(variables.refreshing, variables.error);

  const {
    localValues,
    upsertStatuses,
    updating,
    dirtyKeys,
    onChange: handleChange,
    onRevert: handleRevert,
    onSave,
  } = useVariableEditor({
    keys,
    savedValues: variables.values,
    account,
    repo,
    envName,
    onSavedKey: variables.onConfirmed,
    populate,
    autoSaveCounter,
    onAutoSaveResult,
  });

  const visibleKeys = hiddenKeys?.length ? keys.filter((k) => !hiddenKeys.includes(k)) : keys;

  // Counts what is on screen; a hidden key has no row for the reader to go and fill in.
  const notConfigured = visibleKeys.filter((k) => !variables.values[k]).length;

  const complete = keys.every((k) => !!variables.values[k]);
  const scopedValues = Object.fromEntries(keys.map((k) => [k, variables.values[k] ?? ""]));
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);
  useEffect(() => {
    onLoadedRef.current?.(scopedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scopedValues)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onCompleteRef.current?.(complete);
  }, [complete]);

  const handleRefresh = () => {
    markClicked();
    void variables.onRefresh();
  };
  const handleSave = async () => {
    const result = await onSave();
    if (result.savedKeys.length > 0) onSaved?.(result.savedKeys);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="sectionLabel">{title}</Typography>
          {variables.loading && <CircularProgress aria-label="Loading variables" size={12} sx={{ color: "text.muted" }} />}
          {!variables.loading && notConfigured > 0 && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "caption", color: "warning.light" }} />
              <Typography color="warning.light">{notConfigured} not configured</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <RefreshButton
            busy={variables.refreshing}
            result={refreshResult}
            disabled={!account || !repo || !envName || variables.refreshing}
            onClick={handleRefresh}
          />
        </Box>
      </Box>

      <VariablesCard
        requiredKeys={visibleKeys}
        savedValues={variables.values}
        localValues={localValues}
        upsertStatuses={upsertStatuses}
        overwriteWarning
        keyErrors={keyErrors}
        onChange={handleChange}
        onRevert={handleRevert}
      />

      <Box
        sx={{
          mt: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SaveButton
            verb="Save"
            noun="variable"
            count={dirtyKeys.length}
            loading={updating}
            disabled={!!disabled || !account || !repo || !envName || updating || dirtyKeys.length === 0}
            onClick={() => void handleSave()}
          />
          {saveHint}
        </Box>
        {githubUrl && (
          <ExternalLink href={githubUrl} label="Manage on GitHub">
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexShrink: 0, color: "text.muted", "&:hover": { color: "text.primary" } }}>
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                Manage on GitHub
              </Box>
              <OpenInNewIcon aria-hidden="true" sx={{ typography: "caption" }} />
            </Box>
          </ExternalLink>
        )}
      </Box>
    </Box>
  );
}
