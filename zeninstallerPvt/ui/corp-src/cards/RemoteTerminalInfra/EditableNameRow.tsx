/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, CircularProgress, IconButton, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";

type EditableNameRowProps = {
  label: string;
  value: string;
  onChange: (name: string) => void;
  error: string | null;
  checking: boolean;
  check: () => Promise<boolean>;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  width: number;
  hint?: string;
};

export default function EditableNameRow({ label, value, onChange, error, checking, check, editing, setEditing, width, hint }: EditableNameRowProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minHeight: "1.6em" }}>
      <Typography color="text.muted">{label}:</Typography>
      {editing ? (
        <>
          <TextField
            size="small"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            error={!!error}
            helperText={error ?? hint}
            sx={{ width }}
            className="corpTechnicalInput"
            inputProps={{ "aria-label": label }}
          />
          {/* Stays open until the name is one this installation can actually create or reuse. */}
          <IconButton
            aria-label={`Confirm ${label}`}
            size="small"
            disabled={checking}
            onClick={() => void check().then((ok) => ok && setEditing(false))}
            sx={{ color: "success.main", p: 0.25 }}
          >
            {checking ? <CircularProgress aria-label={`Checking ${label}`} size={12} /> : <CheckIcon sx={{ typography: "caption" }} />}
          </IconButton>
        </>
      ) : (
        <>
          <Typography color="text.primary">{value}</Typography>
          <IconButton aria-label={`Edit ${label}`} size="small" onClick={() => setEditing(true)} sx={{ color: "text.disabled", p: 0.25, "&:hover": { color: "primary.main" } }}>
            <EditIcon sx={{ typography: "caption" }} />
          </IconButton>
        </>
      )}
    </Box>
  );
}
