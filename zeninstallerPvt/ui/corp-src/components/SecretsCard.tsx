/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, Divider, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { alpha } from "@mui/material/styles";
import FieldLabel from "./FieldLabel";
import type { PendingSecret, SecretsStatus, UpsertStatus } from "../types";

// ─── Validation badge ─────────────────────────────────────────────────────────

function ValidationBadge({ valid, pendingValidation }: { valid: boolean | null; pendingValidation: boolean }) {
  if (pendingValidation) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          px: 0.875,
          py: 0.2,
          borderRadius: 0.5,
          backgroundColor: (theme) => alpha(theme.palette.warning.light, 0.1),
          border: (theme) => `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
          color: "warning.dark",
          whiteSpace: "nowrap",
        }}
        role="status"
        aria-live="polite"
      >
        pending validation
      </Box>
    );
  }
  if (valid === true) {
    return (
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
          color: "success.main",
        }}
        role="status"
        aria-live="polite"
      >
        <CheckCircleIcon sx={{ fontSize: 10 }} />
        valid
      </Box>
    );
  }
  if (valid === false) {
    return (
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
          color: "error.light",
        }}
        role="alert"
      >
        <ErrorOutlineIcon sx={{ fontSize: 10 }} />
        invalid
      </Box>
    );
  }
  return null;
}

// ─── Secret key row ───────────────────────────────────────────────────────────

function SecretKeyRow({
  secretKey,
  present,
  valid,
  pending,
  upsertStatus,
  onEdit,
  onCancelPending,
}: {
  secretKey: string;
  present: boolean;
  valid: boolean | null;
  pending: PendingSecret | undefined;
  upsertStatus: UpsertStatus | undefined;
  onEdit: (key: string) => void;
  onCancelPending: (key: string) => void;
}) {
  const [showValue, setShowValue] = useState(false);
  const hasPending = !!pending;
  const isSuccess = upsertStatus?.status === "success";
  const isError = upsertStatus?.status === "error";
  const isSet = present || isSuccess;

  // ── Left icon ────────────────────────────────────────────────────────────
  /*
   * ✓  = set + validated
   * ●  = set, not validated (or never run)
   * ◉  = pending staged change (amber)
   * ○  = not set
   */
  let LeftIcon: typeof CheckCircleIcon;
  let iconColor: string;
  if (hasPending) {
    LeftIcon = RadioButtonCheckedIcon;
    iconColor = "warning.main";
  } else if (isSet && valid === true) {
    LeftIcon = CheckCircleIcon;
    iconColor = "success.main";
  } else if (isSet) {
    LeftIcon = RadioButtonCheckedIcon;
    iconColor = "success.main";
  } else {
    LeftIcon = RadioButtonUncheckedIcon;
    iconColor = "text.disabled";
  }

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
            : hasPending
              ? alpha(theme.palette.warning.light, 0.08)
              : "transparent",
        transition: "background 0.2s",
      }}
    >
      {/* Left icon */}
      <LeftIcon sx={{ fontSize: 15, color: iconColor, flexShrink: 0 }} />

      {/* Key name */}
      <Typography
        sx={{
          color: hasPending ? "warning.dark" : "text.primary",
          flex: 1,
        }}
      >
        {secretKey}
      </Typography>

      {/* Pending value + visibility toggle + cancel */}
      {hasPending && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            sx={{
              color: "warning.main",
            }}
            data-sensitive="true"
          >
            {showValue ? pending!.value : "•".repeat(Math.min(pending!.value.length, 12))}
          </Typography>
          <IconButton
            aria-label={`${showValue ? "Hide" : "Show"} pending value for ${secretKey}`}
            size="small"
            onClick={() => setShowValue((v) => !v)}
            sx={{ color: "text.muted", p: 0.25, "&:hover": { color: "text.secondary" } }}
          >
            {showValue ? <VisibilityOffIcon sx={{ fontSize: 13 }} /> : <VisibilityIcon sx={{ fontSize: 13 }} />}
          </IconButton>
          <Tooltip title="Discard change">
            <IconButton aria-label={`Discard pending change for ${secretKey}`} size="small" onClick={() => onCancelPending(secretKey)} sx={{ color: "text.muted", p: 0.25, "&:hover": { color: "error.main" } }}>
              <CloseIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Validation badge — hidden while staging */}
      {!hasPending && <ValidationBadge valid={valid} pendingValidation={isSuccess} />}

      {/* Just updated */}
      {isSuccess && (
        <Typography role="status" aria-live="polite" sx={{ color: "success.main", whiteSpace: "nowrap" }}>just updated</Typography>
      )}

      {/* Update error */}
      {isError && (
        <Tooltip title={upsertStatus!.error ?? "Update failed"}>
          <Box component="span" role="alert" aria-label={upsertStatus!.error ?? "Update failed"} sx={{ display: "inline-flex" }}>
            <ErrorOutlineIcon aria-hidden="true" sx={{ fontSize: 14, color: "error.light", flexShrink: 0 }} />
          </Box>
        </Tooltip>
      )}

      {/* Not set label */}
      {!isSet && !hasPending && !isError && (
        <Typography color="text.disabled">not set</Typography>
      )}

      {/* Edit button */}
      <IconButton aria-label={`Edit ${secretKey}`} size="small" onClick={() => onEdit(secretKey)} sx={{ color: "text.disabled", p: 0.5, "&:hover": { color: "primary.main" } }}>
        <EditIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}

// ─── Secret input dialog ──────────────────────────────────────────────────────

function SecretDialog({
  open,
  secretKey,
  onClose,
  onConfirm,
}: {
  open: boolean;
  secretKey: string;
  onClose: () => void;
  onConfirm: (key: string, value: string) => void;
}) {
  const [value, setValue] = useState("");

  const handleConfirm = () => {
    if (!value.trim()) return;
    onConfirm(secretKey, value.trim());
    setValue("");
    onClose();
  };

  const handleClose = () => {
    setValue("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: (theme) => ({ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 1 }) }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography color="text.primary">{secretKey}</Typography>
          <FieldLabel htmlFor="secret-value" sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 0.25 }}>
            Enter the secret value
          </FieldLabel>
        </Box>
        <IconButton aria-label={`Close secret editor for ${secretKey}`} onClick={handleClose} size="small" sx={{ color: "text.muted" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Divider sx={{ borderColor: "divider" }} />

      <DialogContent sx={{ pt: 2.5 }}>
        <TextField
          id="secret-value"
          className="corpEditor"
          data-sensitive="true"
          fullWidth
          autoFocus
          type="password"
          placeholder="Secret value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          InputProps={{ endAdornment: <InputAdornment position="end" /> }}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mt: 2.5 }}>
          <Button onClick={handleClose} size="small" color="inherit" sx={{ color: "text.muted" }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!value.trim()}
            variant="contained"
            size="small"
          >
            Set
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  requiredKeys: string[];
  presentKeys: string[];
  secretsStatus: SecretsStatus;
  // Controlled by EnvironmentCard
  pendingSecrets: PendingSecret[];
  onSetPending: (key: string, value: string) => void;
  onCancelPending: (key: string) => void;
  upsertStatuses: UpsertStatus[];
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecretsCard({ requiredKeys, presentKeys, secretsStatus, pendingSecrets, onSetPending, onCancelPending, upsertStatuses }: Props) {
  const [dialogKey, setDialogKey] = useState<string | null>(null);

  return (
    <Box>
      {/* Key list */}
      <Box sx={{ border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden" }}>
        {requiredKeys.map((k) => (
          <SecretKeyRow
            key={k}
            secretKey={k}
            present={presentKeys.includes(k)}
            valid={secretsStatus.valid}
            pending={pendingSecrets.find((p) => p.key === k)}
            upsertStatus={upsertStatuses.find((s) => s.key === k)}
            onEdit={(key) => setDialogKey(key)}
            onCancelPending={onCancelPending}
          />
        ))}
      </Box>

      <SecretDialog open={!!dialogKey} secretKey={dialogKey ?? ""} onClose={() => setDialogKey(null)} onConfirm={onSetPending} />
    </Box>
  );
}
