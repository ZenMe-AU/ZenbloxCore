/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { UseGithubVariablesV2 } from "../hooks/useGithubVariablesV2";
import VariablesCard from "../components/VariablesCard";
import ExternalLink from "../components/ExternalLink";
import RefreshButton from "../components/RefreshButton";
import SaveButton from "../components/SaveButton";
import { useVariableEditorV2 } from "../hooks/util/useVariableEditorV2";
import { useRefreshIndicator } from "../hooks/util/useRefreshIndicator";

// CloudVariableDetail for the V2 cards: where to save and which GitHub session to save through both come
// from the variables, so they can't point at different environments or sign-ins.
type Props = {
  keys: readonly string[];
  // Saved and counted like the rest, but never shown — values the card derives, not ones anyone types.
  hiddenKeys?: readonly string[];
  variables: UseGithubVariablesV2;
  populate?: Record<string, string>;
  title?: string;
  disabled?: boolean;
  /** Refresh clean fields from saved values but keep local edits; remount when the account/repo/environment scope changes. */
  preserveDirtyOnSync?: boolean;
  onComplete?: (done: boolean) => void;
  // Rendered next to the Save button (e.g. an "unsaved change" warning); a function is told whether the draft has edits left to save.
  saveHint?: ReactNode | ((draft: { dirty: boolean }) => ReactNode);
  tableHint?: ReactNode; // Rendered under the variable table, above the Save button (e.g. a note on the whole set).
  keyHints?: Partial<Record<string, ReactNode>>; // Note under one variable's row, e.g. where its value comes from.
  keyErrors?: Partial<Record<string, string>>; // Per-key external validation error, shown as a row-level error icon.
  populateCounter?: number; // Increment to apply populate values into the draft again, even unchanged (not saved).
  autoSaveCounter?: number; // Increment to auto-apply populate values and immediately save them to GitHub.
  onAutoSaveResult?: (result: "saved" | "no-changes" | "error") => void; // Called when auto-save (triggered by autoSaveCounter) completes.
  onLoaded?: (saved: Record<string, string>) => void;
  onSaved?: (keys: string[]) => void;
};

export default function CloudVariableDetailV2({
  keys,
  hiddenKeys,
  variables,
  populate,
  title = "Variables",
  disabled,
  preserveDirtyOnSync,
  onComplete,
  saveHint,
  tableHint,
  keyHints,
  keyErrors,
  populateCounter,
  autoSaveCounter,
  onAutoSaveResult,
  onLoaded,
  onSaved,
}: Props) {
  const { refreshResult, markClicked } = useRefreshIndicator(variables.refreshing, variables.error);
  const account = variables.target?.account ?? null;
  const repo = variables.target?.repoName ?? "";
  const envName = variables.target?.envName ?? null;
  const githubUrl = variables.target?.envUrl;

  const {
    localValues,
    upsertStatuses,
    updating,
    dirtyKeys,
    onChange: handleChange,
    onRevert: handleRevert,
    onSave,
  } = useVariableEditorV2({
    keys,
    savedValues: variables.values,
    account,
    repo,
    envName,
    api: variables.api,
    onSavedKey: variables.onConfirmed,
    populate,
    preserveDirtyOnSync,
    populateCounter,
    autoSaveCounter,
    onAutoSaveResult,
  });

  const visibleKeys = hiddenKeys?.length ? keys.filter((k) => !hiddenKeys.includes(k)) : keys;

  // Both count what is on screen; a hidden key has no row for the reader to fill in or to have edited.
  const notConfigured = visibleKeys.filter((k) => !variables.values[k]).length;
  const visibleDirtyKeys = dirtyKeys.filter((k) => visibleKeys.includes(k));

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
        keyHints={keyHints}
        onChange={handleChange}
        onRevert={handleRevert}
      />

      {tableHint && <Box sx={{ mt: 1 }}>{tableHint}</Box>}

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
            count={visibleDirtyKeys.length}
            loading={updating}
            disabled={!!disabled || !account || !repo || !envName || updating || dirtyKeys.length === 0}
            onClick={() => void handleSave()}
          />
          {typeof saveHint === "function" ? saveHint({ dirty: dirtyKeys.length > 0 }) : saveHint}
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
