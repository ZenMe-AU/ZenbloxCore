/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, CircularProgress, IconButton, MenuItem, Select, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import ErrorText from "./ErrorText";

// One padding for every inline control, so a name box and a dropdown are the same height in the list.
const compactInputSx = { "& .MuiInputBase-input": { py: 0.35 } };

// ─── Plain row ────────────────────────────────────────────────────────────────

export function PlainRow({ label, value, error }: { label: string; value: string; error?: string | null }) {
  return (
    <Box>
      <Typography color="text.muted">
        {label}:{" "}
        <Box component="span" sx={{ color: "text.primary" }}>
          {value}
        </Box>
      </Typography>
      {error && <ErrorText>{error}</ErrorText>}
    </Box>
  );
}

// ─── Editable name row ────────────────────────────────────────────────────────

type EditableNameRowProps = {
  label: string;
  value: string;
  onChange: (name: string) => void;
  error?: string | null; // e.g. the name is taken somewhere in Azure (global uniqueness check)
  checking: boolean;
  check: () => Promise<boolean>;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  width: number;
};

export function EditableNameRow({ label, value, onChange, error, checking, check, editing, setEditing, width }: EditableNameRowProps) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minHeight: "1.6em" }}>
        <Typography color="text.muted">{label}:</Typography>
        {editing ? (
          <>
            <TextField
              size="small"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              error={!!error}
              sx={{ width, ...compactInputSx }}
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
      {error && <ErrorText>{error}</ErrorText>}
    </Box>
  );
}

// ─── Selection row ────────────────────────────────────────────────────────────

export type SelectionOption = { value: string; label: string };

type SelectionRowProps = {
  id?: string; // Put on the control; specs target it (e.g. #core-infra-location).
  label: string; // Row label and the control's accessible name, e.g. "Location".
  name: string; // What is being chosen, for the button and spinner names, e.g. "Azure region".
  value: string;
  onChange: (value: string) => void;
  options: SelectionOption[]; // The list to pick from; empty falls back to free text (e.g. the list failed to load).
  error?: string | null; // e.g. why the list could not load
  loading: boolean;
  placeholder: string; // Free-text hint, e.g. "e.g. australiaeast".
  editing: boolean;
  setEditing: (editing: boolean) => void;
};

export function SelectionRow({ id, label, name, value, onChange, options, error, loading, placeholder, editing, setEditing }: SelectionRowProps) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minHeight: "1.6em" }}>
        {editing ? (
          <>
            <Typography color="text.muted">{label}:</Typography>
            {options.length > 0 ? (
              <Select
                id={id}
                size="small"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                error={!!error}
                inputProps={{ "aria-label": label }}
                sx={{ minWidth: 220, ...compactInputSx }}
              >
                {options.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}{" "}
                    <Box component="span" sx={{ color: "text.muted", ml: 0.5 }}>
                      ({o.value})
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            ) : (
              <TextField
                id={id}
                size="small"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={loading ? "Loading..." : placeholder}
                error={!!error}
                sx={{ minWidth: 220, ...compactInputSx }}
                className="corpTechnicalInput"
                inputProps={{ "aria-label": label }}
              />
            )}
            {loading && <CircularProgress aria-label={`Loading ${name}s`} size={12} />}
            <IconButton aria-label={`Confirm ${name}`} size="small" onClick={() => setEditing(false)} sx={{ color: "success.main", p: 0.25 }}>
              <CheckIcon sx={{ typography: "caption" }} />
            </IconButton>
          </>
        ) : (
          <>
            <PlainRow label={label} value={options.find((o) => o.value === value)?.label ?? value} />
            <IconButton aria-label={`Edit ${name}`} size="small" onClick={() => setEditing(true)} sx={{ color: "text.disabled", p: 0.25, "&:hover": { color: "primary.main" } }}>
              <EditIcon sx={{ typography: "caption" }} />
            </IconButton>
          </>
        )}
      </Box>
      {error && <ErrorText>{error}</ErrorText>}
    </Box>
  );
}
