/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Autocomplete, Box, Button, ButtonBase, Chip, CircularProgress, IconButton, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import UndoIcon from "@mui/icons-material/Undo";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import Card from "../../components/Card";
import RefreshButton from "../../components/RefreshButton";
import { useRefreshIndicator } from "../../hooks/util/useRefreshIndicator";
import type { CardChrome } from "../../types";
import { isRowDirty, wouldCreateCycle, type UseGlobalGroupsCard, type GroupRow, type GroupRowResult } from "./useGlobalGroupsCard";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";

function RowStatusIcon({ row, result, dirty }: { row: GroupRow; result: GroupRowResult | undefined; dirty: boolean }) {
  const status = result?.status;
  if (status === "running") return <CircularProgress aria-label={`Syncing ${row.groupName || "group"}`} size={13} sx={{ color: "primary.main" }} />;
  if (status === "done" || status === "skipped") return <CheckCircleOutlineIcon aria-label={`${row.groupName || "Group"} synced`} sx={{ typography: "caption", color: "success.main" }} />;
  if (status === "error") return <ErrorOutlineIcon aria-label={`${row.groupName || "Group"} sync failed`} sx={{ typography: "caption", color: "error.main" }} />;
  if (row.isNew && !row.groupName.trim()) return <RadioButtonUncheckedIcon aria-hidden="true" sx={{ typography: "caption", color: "text.disabled" }} />;
  if (dirty) return <RadioButtonCheckedIcon aria-label={`${row.groupName || "Group"} has unsaved changes`} sx={{ typography: "caption", color: "warning.main" }} />;
  return <CheckCircleOutlineIcon aria-label={`${row.groupName || "Group"} unchanged`} sx={{ typography: "caption", color: "text.muted" }} />;
}

// Invisible until hovered/focused — reads as plain text at rest, becomes an input on interaction.
const ghostFieldSx = (muted: boolean) => (theme: import("@mui/material/styles").Theme) => ({
  "& .MuiOutlinedInput-root": {
    borderRadius: 0.5,
    "& fieldset": { borderColor: "transparent" },
    "&:hover fieldset": { borderColor: theme.palette.divider },
    "&.Mui-focused fieldset": { borderColor: theme.palette.primary.light },
    "&.Mui-error fieldset": { borderColor: theme.palette.error.light },
  },
  "& .MuiInputBase-input": {
    padding: "1px 4px",
    typography: muted ? "caption" : "body1",
    color: muted ? theme.palette.text.muted : theme.palette.text.primary,
  },
});

type Props = {
  card: CardChrome;
  globalGroups: UseGlobalGroupsCard;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      A simple view of this tenant's Entra security groups; edit, create, or delete groups, and manage their nesting directly.
    </Typography>
  );
}

/*
 * A lightweight Entra security-groups manager: the list mirrors what actually exists in the
 * tenant. Rows with unsynced edits are tinted and get an amber "pending" status circle, the same
 * not-set/pending/synced vocabulary VariablesCard uses for GitHub variables. "Add default
 * groups" offers the same 5-group template ZBCorpArchitecture/corpSetup's c02globalGroups
 * Terraform stage creates, as a starting point.
 */
export default function GlobalGroupsCard({ card, globalGroups }: Props) {
  const {
    rows,
    savedById,
    rowResults,
    rowErrors,
    loading,
    refreshing,
    refresh,
    addRow,
    addDefaultGroups,
    updateRow,
    removeRow,
    revertRow,
    pendingDeleteId,
    requestDeleteRow,
    cancelDeleteRow,
    confirmDeleteRow,
    deleting,
    canSync,
    syncing,
    sync,
    consentRequired,
    requestGroupsConsent,
  } = globalGroups;
  const disabled = card.locked;
  const { refreshResult, markClicked } = useRefreshIndicator(refreshing);
  const [expandedMemberOfId, setExpandedMemberOfId] = useState<string | null>(null);
  // Excludes names that would close a membership cycle (directly or transitively) with this row,
  // so a cyclic parent can't be selected in the first place.
  const memberOfOptions = (row: GroupRow) =>
    rows
      .filter((r) => r.id !== row.id)
      .map((r) => r.groupName)
      .filter((name) => !!name && !wouldCreateCycle(rows, row.groupName, name));

  const handleRefresh = () => {
    markClicked();
    void refresh();
  };

  return (
    <Card title="Global groups" lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Intro />
          <RefreshButton busy={refreshing} result={refreshResult} disabled={disabled || loading} onClick={handleRefresh} />
        </Box>

        {consentRequired && (
          <Box
            sx={{
              backgroundColor: "background.default",
              border: "1px solid",
              borderColor: "warning.main",
              borderRadius: 1,
              px: 2,
              py: 1.25,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
            role="status"
            aria-live="polite"
          >
            <Typography color="warning.dark">Additional Microsoft Graph consent is required.</Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void requestGroupsConsent()}
              sx={{ minWidth: 0, px: 1, flexShrink: 0 }}
            >
              Grant consent
            </Button>
          </Box>
        )}

        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <CircularProgress aria-label="Loading Entra groups" size={12} />
            <StatusText>Loading groups from Entra...</StatusText>
          </Box>
        )}

        {!loading && rows.length === 0 && <Typography color="text.secondary" role="status">No groups yet in this tenant.</Typography>}

        {/* Group list */}
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
          {rows.map((row) => {
            const memberOfExpanded = expandedMemberOfId === row.id;
            const dirty = isRowDirty(row, savedById);
            return (
              <Box
                key={row.id}
                sx={(theme) => ({
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  py: 0.75,
                  px: 1.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  backgroundColor: dirty ? alpha(theme.palette.warning.main, 0.08) : "transparent",
                  transition: "background 0.15s",
                })}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <RowStatusIcon row={row} result={rowResults[row.id]} dirty={dirty} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      fullWidth
                      inputProps={{ "aria-label": `Group name ${row.groupName || "new group"}` }}
                      placeholder="Group name"
                      value={row.groupName}
                      onChange={(e) => updateRow(row.id, { groupName: e.target.value })}
                      error={!!rowErrors[row.id]}
                      disabled={disabled}
                      sx={ghostFieldSx(false)}
                    />
                    <TextField
                      size="small"
                      variant="outlined"
                      fullWidth
                      inputProps={{ "aria-label": `Description for ${row.groupName || "new group"}` }}
                      placeholder="Description (optional)"
                      value={row.description}
                      onChange={(e) => updateRow(row.id, { description: e.target.value })}
                      disabled={disabled}
                      sx={ghostFieldSx(true)}
                    />
                  </Box>
                  {!memberOfExpanded && (
                    <ButtonBase
                      aria-label={`Edit memberships for ${row.groupName || "new group"}`}
                      disabled={disabled}
                      onClick={() => setExpandedMemberOfId(row.id)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      {row.memberOfGroupNames.length === 0 ? (
                        <Typography color="text.disabled">no memberships</Typography>
                      ) : (
                        <>
                          <Chip label={row.memberOfGroupNames[0]} size="small" sx={{ height: 18 }} />
                          {row.memberOfGroupNames.length > 1 && (
                            <Chip label={`+${row.memberOfGroupNames.length - 1}`} size="small" sx={{ height: 18 }} />
                          )}
                        </>
                      )}
                    </ButtonBase>
                  )}
                  {!row.isNew && dirty && (
                    <IconButton
                      size="small"
                      onClick={() => revertRow(row.id)}
                      disabled={disabled}
                      title="Undo changes"
                      aria-label={`Undo changes to ${row.groupName}`}
                      sx={{ color: "text.disabled", "&:hover": { color: "warning.main" } }}
                    >
                      <UndoIcon sx={{ typography: "caption" }} />
                    </IconButton>
                  )}
                  {row.isNew ? (
                    <IconButton aria-label={`Remove new group ${row.groupName || "row"}`} size="small" onClick={() => removeRow(row.id)} disabled={disabled} sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}>
                      <CloseIcon sx={{ typography: "caption" }} />
                    </IconButton>
                  ) : (
                    <IconButton
                      aria-label={`Delete group ${row.groupName}`}
                      size="small"
                      onClick={() => requestDeleteRow(row.id)}
                      disabled={disabled}
                      sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                    >
                      <DeleteOutlineIcon sx={{ typography: "caption" }} />
                    </IconButton>
                  )}
                </Box>

                {memberOfExpanded && (
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, pl: 3.25 }}>
                    <Autocomplete
                      multiple
                      size="small"
                      openOnFocus
                      options={memberOfOptions(row)}
                      value={row.memberOfGroupNames}
                      onChange={(_, value) => updateRow(row.id, { memberOfGroupNames: value })}
                      disabled={disabled}
                      sx={{ flex: 1 }}
                      renderOption={(props, option) => (
                        <Box component="li" {...props} sx={{ py: 0.75 }}>
                          {option}
                        </Box>
                      )}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Member of..." inputProps={{ ...params.inputProps, "aria-label": `Memberships for ${row.groupName || "new group"}` }} />
                      )}
                    />
                    <Button
                      size="small"
                      onClick={() => setExpandedMemberOfId(null)}
                      sx={{ color: "text.secondary", mt: 0.5 }}
                    >
                      Done
                    </Button>
                  </Box>
                )}

                {rowErrors[row.id] && <ErrorText>{rowErrors[row.id]}</ErrorText>}
                {rowResults[row.id]?.status === "error" && (
                  <ErrorText>{rowResults[row.id]?.detail}</ErrorText>
                )}
                {(rowResults[row.id]?.membershipIssues?.length ?? 0) > 0 && (
                  <Typography color="warning.main" role="status" sx={{ pl: 3.25 }}>
                    Membership issues: {rowResults[row.id]?.membershipIssues?.join("; ")}
                  </Typography>
                )}
                {pendingDeleteId === row.id && (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.75,
                      backgroundColor: "background.default",
                      border: "1px solid",
                      borderColor: "error.light",
                      borderRadius: 1,
                      px: 1.5,
                      py: 1,
                    }}
                  >
                    <Typography color="error.dark" role="alert">
                      Permanently delete <b>{row.groupName}</b> from Entra ID? This cannot be undone
                      {row.memberOfGroupNames.length > 0 ? " and will also drop its group memberships" : ""}.
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => void confirmDeleteRow()}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress aria-label="Deleting group" size={12} /> : undefined}
                        sx={{
                          backgroundColor: "error.main",
                          "&:hover": { backgroundColor: "error.dark" },
                        }}
                      >
                        Delete permanently
                      </Button>
                      <Button
                        size="small"
                        onClick={cancelDeleteRow}
                        disabled={deleting}
                        sx={{ color: "text.secondary" }}
                      >
                        Cancel
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}

          {/* Trailing "add a row" affordance — part of the list, not a separate button below it. */}
          <ButtonBase
            disabled={disabled}
            onClick={addRow}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              py: 0.75,
              px: 1.5,
              color: "text.muted",
              "&:hover": { backgroundColor: "action.hover", color: "primary.main" },
            }}
          >
            <AddIcon aria-hidden="true" sx={{ typography: "caption" }} />
            <Typography color="inherit">Add group</Typography>
          </ButtonBase>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={() => void sync()}
            disabled={disabled || !canSync || syncing}
            startIcon={syncing ? <CircularProgress aria-label="Syncing groups" size={12} /> : undefined}
            sx={{
              py: 0.65,
              px: 2,
            }}
          >
            Sync groups
          </Button>
          <Button
            size="small"
            startIcon={<AddIcon sx={{ typography: "caption" }} />}
            onClick={addDefaultGroups}
            disabled={disabled}
            sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}
          >
            Add default groups
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
