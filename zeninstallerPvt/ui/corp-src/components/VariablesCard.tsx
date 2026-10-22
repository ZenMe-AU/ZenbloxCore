/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { alpha } from "@mui/material/styles";
import FieldLabel from "./FieldLabel";
import type { UpsertStatus } from "../types";
import { getVariableDisplayName } from "../logic/variables";

// ─── Variable row ─────────────────────────────────────────────────────────────

function VariableRow({
  varKey,
  savedValue,
  localValue,
  isDirty,
  upsertStatus,
  validStatus,
  description,
  deployedValues,
  overwriteWarning,
  error,
  onChange,
  onRevert,
}: {
  varKey: string;
  savedValue: string | undefined;
  localValue: string;
  isDirty: boolean;
  upsertStatus: UpsertStatus | undefined;
  validStatus?: boolean | null;
  description?: string;
  deployedValues?: Record<string, string>;
  overwriteWarning?: boolean;
  error?: string; // External validation error (e.g. app reg not found in tenant) — independent of upsert/save status.
  onChange: (key: string, value: string) => void;
  onRevert: (key: string) => void;
}) {
  const isSuccess = upsertStatus?.status === "success";
  const isError = upsertStatus?.status === "error" || !!error;
  // Value differs from what was last planned (corp.env snapshot)
  const isDeployedDiff = deployedValues !== undefined && (savedValue ?? "") !== (deployedValues[varKey] ?? "");
  // A pending edit will replace a non-empty value already saved on GitHub
  const willOverwrite = !!overwriteWarning && isDirty && !!savedValue;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 0.875,
        px: 2,
        borderBottom: (theme) => `1px solid ${theme.palette.background.default}`,
        backgroundColor: (theme) => isSuccess
          ? alpha(theme.palette.success.light, 0.1)
          : isError
            ? alpha(theme.palette.error.light, 0.08)
            : isDirty
              ? alpha(theme.palette.warning.light, 0.08)
              : "transparent",
        transition: "background 0.2s",
      }}
    >
      {/* Key label + optional info tooltip */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: "10.5rem", flexShrink: 0 }}>
        <FieldLabel
          htmlFor={`variable-${varKey}`}
          sx={{ color: (theme) => isDirty ? theme.palette.warning.dark : theme.palette.text.primary, whiteSpace: "nowrap", mb: 0 }}
        >
          {getVariableDisplayName(varKey)}
        </FieldLabel>
        {description && (
          <Tooltip title={description} placement="top" arrow>
            <InfoOutlinedIcon sx={{ typography: "caption", color: (theme) => theme.palette.card.mutedIcon, cursor: "help", "&:hover": { color: (theme) => theme.palette.card.mutedIconHover } }} />
          </Tooltip>
        )}
      </Box>

      <TextField
        id={`variable-${varKey}`}
        className="corpEditor"
        data-editor-state={isError ? "error" : isDirty ? "dirty" : undefined}
        data-sensitive="true"
        error={isError}
        placeholder="not set"
        value={localValue}
        onChange={(e) => onChange(varKey, e.target.value)}
        sx={{ flex: 1 }}
        InputProps={{
          endAdornment:
            localValue || isDirty ? (
              <InputAdornment position="end" sx={{ gap: 0 }}>
                {localValue && (
                  <IconButton aria-label={`Clear ${getVariableDisplayName(varKey)}`} size="small" onClick={() => onChange(varKey, "")} sx={{ color: (theme) => theme.palette.text.muted, p: 0.25, "&:hover": { color: (theme) => theme.palette.text.secondary } }}>
                    <ClearIcon sx={{ typography: "caption" }} />
                  </IconButton>
                )}
                {isDirty && (
                  <Tooltip title="Revert to saved value">
                    <IconButton aria-label={`Revert ${getVariableDisplayName(varKey)} to saved value`} size="small" onClick={() => onRevert(varKey)} sx={{ color: (theme) => theme.palette.text.muted, p: 0.25, "&:hover": { color: (theme) => theme.palette.warning.main } }}>
                      <UndoIcon sx={{ typography: "caption" }} />
                    </IconButton>
                  </Tooltip>
                )}
              </InputAdornment>
            ) : undefined,
        }}
      />

      {isDeployedDiff && !isDirty && !isError && (
        <Tooltip title={`Plan configured: ${deployedValues![varKey] || "(empty)"}`} placement="top" arrow>
          <WarningAmberIcon sx={{ typography: "caption", color: (theme) => theme.palette.warning.main, flexShrink: 0 }} />
        </Tooltip>
      )}

      {willOverwrite && !isError && (
        <Tooltip title={`Replaces saved value: ${savedValue}`} placement="top" arrow>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.4,
              px: 0.875,
              py: 0.2,
              borderRadius: 0.5,
              backgroundColor: (theme) => alpha(theme.palette.warning.light, 0.08),
              border: (theme) => `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
              color: (theme) => theme.palette.warning.dark,
              flexShrink: 0,
              cursor: "help",
            }}
          >
            <WarningAmberIcon sx={{ typography: "caption" }} />
            overwrites
          </Box>
        </Tooltip>
      )}

      {isError && (
        <Tooltip title={error ?? upsertStatus?.error ?? "Update failed"}>
          <Box component="span" role="alert" aria-label={error ?? upsertStatus?.error ?? "Update failed"} sx={{ display: "inline-flex" }}>
            <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "caption", color: (theme) => theme.palette.error.light, flexShrink: 0 }} />
          </Box>
        </Tooltip>
      )}

      {isSuccess && (
        <Typography role="status" aria-live="polite" sx={{ color: "success.dark", whiteSpace: "nowrap" }}>just updated</Typography>
      )}

      {!isDirty && !isSuccess && !isError && validStatus === true && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.4,
            px: 0.875,
            py: 0.2,
            borderRadius: 0.5,
            backgroundColor: (theme) => alpha(theme.palette.success.light, 0.1),
            border: (theme) => `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
            color: "success.dark",
            flexShrink: 0,
          }}
          role="status"
          aria-live="polite"
        >
          <CheckCircleIcon sx={{ typography: "caption" }} />
          valid
        </Box>
      )}

      {!isDirty && !isSuccess && !isError && validStatus === false && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.4,
            px: 0.875,
            py: 0.2,
            borderRadius: 0.5,
            backgroundColor: (theme) => alpha(theme.palette.error.light, 0.08),
            border: (theme) => `1px solid ${alpha(theme.palette.error.light, 0.3)}`,
            color: "error.dark",
            flexShrink: 0,
          }}
          role="alert"
        >
          <ErrorOutlineIcon sx={{ typography: "caption" }} />
          invalid
        </Box>
      )}
    </Box>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  requiredKeys: readonly string[];
  savedValues: Record<string, string>;
  localValues: Record<string, string>;
  upsertStatuses: UpsertStatus[];
  validStatus?: boolean | null;
  descriptions?: Partial<Record<string, string>>; // Optional per-key hint shown as a tooltip on the ⓘ icon
  deployedValues?: Record<string, string>; // Values from the last deployed corp.env snapshot — used to highlight changed rows
  overwriteWarning?: boolean; // When true, dirty rows that replace a non-empty saved value show an "overwrites" warning
  keyErrors?: Partial<Record<string, string>>; // Per-key external validation error (e.g. app reg not found in tenant)
  onChange: (key: string, value: string) => void;
  onRevert: (key: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function VariablesCard({
  requiredKeys,
  savedValues,
  localValues,
  upsertStatuses,
  validStatus,
  descriptions,
  deployedValues,
  overwriteWarning,
  keyErrors,
  onChange,
  onRevert,
}: Props) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "card.contentDivider", borderRadius: "8px", overflow: "hidden" }}>
      {requiredKeys.map((key) => (
        <VariableRow
          key={key}
          varKey={key}
          savedValue={savedValues[key]}
          localValue={localValues[key] ?? ""}
          isDirty={(localValues[key] ?? "") !== (savedValues[key] ?? "")}
          upsertStatus={upsertStatuses.find((s) => s.key === key)}
          validStatus={validStatus}
          description={descriptions?.[key]}
          deployedValues={deployedValues}
          overwriteWarning={overwriteWarning}
          error={keyErrors?.[key]}
          onChange={onChange}
          onRevert={onRevert}
        />
      ))}
    </Box>
  );
}
