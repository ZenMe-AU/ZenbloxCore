/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, CircularProgress, IconButton, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import { MONO as mono } from "../../config/styles";

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
};

export default function EditableNameRow({ label, value, onChange, error, checking, check, editing, setEditing, width }: EditableNameRowProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Typography sx={{ fontSize: "0.75rem", color: "#64748b", ...mono }}>{label}:</Typography>
      {editing ? (
        <>
          <TextField
            size="small"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            error={!!error}
            helperText={error ?? undefined}
            sx={{ width }}
            inputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.75rem" } }}
          />
          {/* Stays open until the name is one this installation can actually create or reuse. */}
          <IconButton size="small" disabled={checking} onClick={() => void check().then((ok) => ok && setEditing(false))} sx={{ color: "#22c55e", p: 0.25 }}>
            {checking ? <CircularProgress size={12} /> : <CheckIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: "0.75rem", color: "#0f172a", ...mono }}>{value}</Typography>
          <IconButton size="small" onClick={() => setEditing(true)} sx={{ color: "#cbd5e1", p: 0.25, "&:hover": { color: "#2563eb" } }}>
            <EditIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </>
      )}
    </Box>
  );
}
