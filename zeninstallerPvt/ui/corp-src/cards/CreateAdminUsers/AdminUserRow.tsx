/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, ButtonBase, Chip, IconButton, InputAdornment, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoTip from "../../components/InfoTip";
import WarningNotice from "../../components/WarningNotice";
import type { VerifiedDomain } from "../../api/azureGraph";
import ManagerPicker from "./ManagerPicker";
import { Arrow } from "./RowParts";
import { accountTable, box, circle, head, header } from "./styles";
import { issueHeadline, resolveAdmin, reuseCheck, type AdminRow, type RowField, type RowIssue } from "./logic";
import type { UseCreateAdminUsersCard } from "./useCreateAdminUsersCard";

// Shown only once a generated value was changed by hand.
function ResetButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <IconButton aria-label={label} title={label} size="small" onClick={onClick} disabled={disabled} sx={{ color: "primary.main" }}>
      <UndoIcon sx={{ typography: "body2" }} />
    </IconButton>
  );
}

// Every problem in full, for the tooltip; the header shows the first one's few words.
function IssueList({ issues }: { issues: RowIssue[] }) {
  return (
    <Box component="span" data-sensitive="true" sx={{ display: "block" }}>
      {issues.map((issue, index) => (
        <Box component="span" key={issue.message} sx={{ display: "block" }}>
          {issues.length > 1 ? `${index + 1}. ${issue.message}` : issue.message}
        </Box>
      ))}
    </Box>
  );
}

// Whether Entra already has the account, so the run updates it, or the run creates it. The privileged account shows only Existing.
function AccountState({ existing }: { existing: boolean }) {
  return <Chip size="small" variant="outlined" label={existing ? "Existing" : "New"} sx={{ ml: 0.75, color: existing ? "warning.dark" : "text.secondary" }} />;
}

// Locked until the domains are read.
function DomainSelect({ label, value, domains, onChange, disabled, note, error }: {
  label: string;
  value: string;
  domains: VerifiedDomain[] | null;
  onChange: (domain: string) => void;
  disabled: boolean;
  note: string | null; // Why it's locked.
  error: boolean;
}) {
  return (
    <TextField
      select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || !domains}
      error={error}
      helperText={note}
      inputProps={{ "aria-label": label }}
      SelectProps={{ renderValue: (v) => v as string }} // "(primary)" only in the list.
      sx={{ flex: 1, minWidth: 0 }}
    >
      {(domains ?? []).map((d) => (
        <MenuItem key={d.name} value={d.name}>
          {d.isDefault ? `${d.name} (primary)` : d.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

// A new admin: the header, then their details and both accounts.
export default function AdminUserRow({ adminUsers, admin: a, index, open, onToggle, editing, onEditToggle }: {
  adminUsers: UseCreateAdminUsersCard;
  admin: AdminRow;
  index: number;
  open: boolean;
  onToggle: () => void;
  editing: boolean;
  onEditToggle: () => void;
}) {
  const { admins, rowIssues, rowWarnings, duplicateUpns, takenUpns, updateAdmin, removeAdmin, searchUsers, signedInUser, domains, primaryDomain, existingAndWaitingAdmins, licenceError, running, consentRequired } = adminUsers;
  const r = resolveAdmin(a);
  const defaultName = resolveAdmin({ ...a, displayName: null }).displayName;
  const defaultUpn = resolveAdmin({ ...a, username: null }).username;
  const domain = a.domain ?? primaryDomain;
  const reuse = reuseCheck(a, primaryDomain, takenUpns);
  const [leftFields, setLeftFields] = useState<ReadonlySet<RowField>>(new Set()); // Fields the operator has moved out of.
  const leave = (field: RowField) => setLeftFields((prev) => (prev.has(field) ? prev : new Set([...prev, field])));
  // A UPN or display name that follows the names counts as left once a name is.
  const left = (field: RowField) => leftFields.has(field) || ((field === "upn" || field === "displayName") && (leftFields.has("givenName") || leftFields.has("surname")));
  const issues = rowIssues[a.key] ?? [];
  // An empty or malformed field shows once the operator leaves it; until then the row is only incomplete.
  const shown = issues.filter((issue) => issue.kind !== "input" || left(issue.field));
  const errors = shown.filter((issue) => issue.kind !== "decision");
  const decisions = shown.filter((issue) => issue.kind === "decision");
  const conflicts = errors.filter((issue) => issue.kind === "conflict"); // The opened row spells these out; a red field is enough for the rest.
  const listed = [...errors, ...decisions];
  const redFields = new Set(errors.map((issue) => issue.field));
  const amberFields = new Set(decisions.map((issue) => issue.field)); // Like a UPN Entra already has.
  const changeWhat = [...new Set(decisions.map((issue) => (issue.field === "upn" ? "UPN" : "Employee ID")))].join(" or ");
  const existing = (name: string) => takenUpns.has(`${name.trim()}@${domain}`.toLowerCase());
  // Red for a UPN an earlier row uses, amber for one Entra already has.
  const upnColor = (name: string) =>
    duplicateUpns[a.key]?.upn === name.trim() ? "error.main" : takenUpns.has(`${name.trim()}@${domain}`.toLowerCase()) ? "warning.dark" : undefined;
  // Consent has its own notice.
  const domainNote = domains || consentRequired ? null : licenceError ? `Couldn't read the domains: ${licenceError}` : "Reading the domains...";
  return (
    <Box sx={box}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <ButtonBase aria-expanded={open} aria-controls={`admin-user-${a.key}`} disableRipple onClick={onToggle} sx={{ ...header, flex: 1, minWidth: 0, flexWrap: { xs: "wrap", sm: "nowrap" }, rowGap: 0.5 }}>
          <Box sx={circle}>{index + 1}</Box>
          <Typography data-sensitive="true" color={r.displayName.trim() ? "text.primary" : "text.muted"} noWrap sx={{ fontWeight: 700, flex: { xs: "1 1 0", sm: "none" } }}>
            {r.displayName.trim() || "New user"}
          </Typography>
          {r.username && (
            <Typography data-sensitive="true" color="text.muted" noWrap sx={{ display: { xs: "none", sm: "block" } }}>
              {r.username}@{domain}
            </Typography>
          )}
          {/* Deprecated: the header shows a few words; the full sentence is in the tooltip and the opened row; kept for reference.
          {rowErrors[a.key] && (
            <Typography color="error.main" noWrap sx={{ minWidth: 0 }}>
              {rowErrors[a.key]}
            </Typography>
          )}
          {rowWarnings[a.key] && (
            <Typography data-sensitive="true" color="warning.dark" noWrap sx={{ minWidth: 0 }}>
              {rowWarnings[a.key]}
            </Typography>
          )}
          */}
          {reuse?.state === "confirmed" && <Chip size="small" variant="outlined" color="info" label="Update" />}
          {/* On a phone the problems take their own line, under the name; 34px lines them up with it. Wider, the UPN shrinks before they do. */}
          {(issues.length > 0 || rowWarnings[a.key]) && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0, order: { xs: 1, sm: 0 }, flexBasis: { xs: "100%", sm: "auto" }, flexShrink: { xs: 1, sm: 0 }, pl: { xs: "34px", sm: 0 } }}>
              {listed.length > 0 && (
                <Tooltip describeChild title={<IssueList issues={listed} />} placement="top" arrow>
                  <Typography color={errors.length ? "error.main" : "warning.dark"} noWrap sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 0.5 }}>
                    {/* Red for an error, amber for a choice, like ErrorText and WarningNotice. */}
                    {errors.length ? <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "body2" }} /> : <WarningAmberIcon aria-hidden="true" sx={{ typography: "body2" }} />}
                    {/* The words shorten first, so "+N more" stays. */}
                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {listed[0].summary}
                    </Box>
                    {listed.length > 1 && <Box component="span" sx={{ flexShrink: 0 }}>+{listed.length - 1} more</Box>}
                  </Typography>
                </Tooltip>
              )}
              {listed.length === 0 && issues.length > 0 && (
                // Unfinished, not wrong: amber, like a choice; red is for errors.
                <Typography color="warning.dark" noWrap sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 0.5 }}>
                  <WarningAmberIcon aria-hidden="true" sx={{ typography: "body2" }} />
                  {issueHeadline(a, issues)}
                </Typography>
              )}
              {rowWarnings[a.key] && (
                <Tooltip describeChild title={<span data-sensitive="true">{rowWarnings[a.key]}</span>} placement="top" arrow>
                  <Typography color="warning.dark" noWrap sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 0.5 }}>
                    <InfoOutlinedIcon aria-hidden="true" sx={{ typography: "body2" }} />
                    Reusing existing account
                  </Typography>
                </Tooltip>
              )}
            </Box>
          )}
          <Arrow open={open} />
        </ButtonBase>
        <IconButton aria-label={`Remove user ${index + 1}`} size="small" onClick={() => removeAdmin(a.key)} disabled={running} sx={{ mx: 0.75 }}>
          <CloseIcon sx={{ typography: "body2" }} />
        </IconButton>
      </Box>
      {open && (
        <Box id={`admin-user-${a.key}`} sx={{ borderTop: "1px solid", borderColor: "divider", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
          {conflicts.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {conflicts.map(({ message }) => (
                <Box key={message} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "body2", color: "error.main" }} />
                  <Typography data-sensitive="true" color="error.main" sx={{ flex: 1, minWidth: 0 }}>
                    {message}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          {/* One notice for every account Entra may already have for this person, each with its own Use. */}
          {decisions.length > 0 && (
            <WarningNotice message={`This person may already have an account in Entra. Use it if it's theirs; otherwise enter a different ${changeWhat}.`}>
              {decisions.map(({ message, fix }) => (
                <Box key={message} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, pl: 3 }}>
                  <Typography data-sensitive="true" sx={{ flex: "1 1 240px", minWidth: 0 }}>
                    {message}
                  </Typography>
                  {fix && (
                    <Button size="small" variant="outlined" onClick={() => updateAdmin(a.key, fix.patch)} disabled={running} sx={{ whiteSpace: "nowrap" }}>
                      {fix.label}
                    </Button>
                  )}
                </Box>
              ))}
            </WarningNotice>
          )}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1 }}>
            <TextField
              size="small"
              label="First name"
              value={a.givenName}
              onChange={(e) => updateAdmin(a.key, { givenName: e.target.value })}
              onBlur={() => leave("givenName")}
              error={redFields.has("givenName")}
              inputProps={{ "data-sensitive": true }}
              disabled={running}
            />
            <TextField
              size="small"
              label="Surname"
              value={a.surname}
              onChange={(e) => updateAdmin(a.key, { surname: e.target.value })}
              onBlur={() => leave("surname")}
              error={redFields.has("surname")}
              inputProps={{ "data-sensitive": true }}
              disabled={running}
            />
            <TextField
              size="small"
              label="Mobile number"
              type="tel"
              autoComplete="off"
              placeholder="+61 400 000 000"
              value={a.mobile}
              onChange={(e) => updateAdmin(a.key, { mobile: e.target.value })}
              onBlur={() => leave("mobile")}
              error={redFields.has("mobile")}
              inputProps={{ "data-sensitive": true }}
              disabled={running}
            />
            <TextField
              size="small"
              label="Employee ID"
              autoComplete="off"
              value={a.employeeId}
              onChange={(e) => updateAdmin(a.key, { employeeId: e.target.value })}
              onBlur={() => leave("employeeId")}
              error={redFields.has("employeeId")}
              inputProps={{ maxLength: 16, "data-sensitive": true }} // Graph's limit.
              disabled={running}
              sx={{ "& input": { color: amberFields.has("employeeId") ? "warning.dark" : undefined } }}
            />
          </Box>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={accountTable(800)}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...head, width: 200 }}>Account</TableCell>
                  <TableCell sx={{ ...head, width: "30%" }}>UPN</TableCell>
                  <TableCell sx={{ ...head, width: "20%" }}>Display name</TableCell>
                  <TableCell sx={head}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      Manager
                      <InfoTip label="Manager information" description="Only their manager can give them an Access Pass.">
                        <InfoOutlinedIcon aria-hidden="true" sx={{ typography: "body2", color: "text.muted" }} />
                      </InfoTip>
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ color: "text.primary", whiteSpace: "nowrap" }}>
                    User account
                    <Button
                      size="small"
                      aria-label={editing ? `Done editing user ${index + 1}` : `Edit user ${index + 1}'s UPN and display name`}
                      onClick={onEditToggle}
                      disabled={running}
                      sx={{ ml: 1, minWidth: 0 }}
                    >
                      {editing ? "Done" : "Edit"}
                    </Button>
                  </TableCell>
                  {editing ? (
                    <>
                      <TableCell data-label="UPN">
                        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5 }}>
                          <TextField
                            size="small"
                            value={r.username}
                            onChange={(e) => updateAdmin(a.key, { username: e.target.value })}
                            disabled={running}
                            onBlur={() => leave("upn")}
                            error={upnColor(r.username) === "error.main" || redFields.has("upn")}
                            inputProps={{ "aria-label": `User ${index + 1} UPN`, "data-sensitive": true }}
                            InputProps={{
                              endAdornment: a.username !== null && a.username !== defaultUpn && (
                                <InputAdornment position="end">
                                  <ResetButton label={`Reset UPN to ${defaultUpn}`} onClick={() => updateAdmin(a.key, { username: null })} disabled={running} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{ flexBasis: "100%", "& input": { color: upnColor(r.username) } }} // The @domain goes on the next line.
                          />
                          <Typography color="text.secondary">@</Typography>
                          <DomainSelect
                            label={`User ${index + 1} domain`}
                            value={domain}
                            domains={domains}
                            onChange={(d) => updateAdmin(a.key, { domain: d === primaryDomain ? null : d })}
                            disabled={running}
                            note={domainNote}
                            error={!domains && !!licenceError}
                          />
                        </Box>
                      </TableCell>
                      <TableCell data-label="Display name">
                        <TextField
                          size="small"
                          fullWidth
                          value={r.displayName}
                          onChange={(e) => updateAdmin(a.key, { displayName: e.target.value })}
                          onBlur={() => leave("displayName")}
                          error={redFields.has("displayName")}
                          disabled={running}
                          inputProps={{ "aria-label": `User ${index + 1} display name`, "data-sensitive": true }}
                          InputProps={{
                            endAdornment: a.displayName !== null && a.displayName !== defaultName && (
                              <InputAdornment position="end">
                                <ResetButton label={`Reset display name to ${defaultName}`} onClick={() => updateAdmin(a.key, { displayName: null })} disabled={running} />
                              </InputAdornment>
                            ),
                          }}
                        />
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell data-label="UPN" data-sensitive="true" sx={{ color: upnColor(r.username) ?? "text.secondary", overflowWrap: "anywhere" }}>{r.username ? <>{`${r.username}@${domain}`}<AccountState existing={existing(r.username)} /></> : "—"}</TableCell>
                      <TableCell data-label="Display name" data-sensitive="true" sx={{ color: "text.secondary" }}>{r.displayName || "—"}</TableCell>
                    </>
                  )}
                  <TableCell data-label="Manager">
                    <ManagerPicker
                      label={`User ${index + 1} manager`}
                      self={a.key}
                      privileged={false}
                      value={a.manager}
                      fallback={signedInUser && { label: `${signedInUser.displayName} (${signedInUser.userPrincipalName})`, group: "Signed-in user", id: signedInUser.id }}
                      admins={admins}
                      existing={existingAndWaitingAdmins}
                      search={searchUsers}
                      onChange={(manager) => updateAdmin(a.key, { manager })}
                      disabled={running}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ color: "text.primary", whiteSpace: "nowrap" }}>Privileged account</TableCell>
                  <TableCell data-label="UPN" data-sensitive="true" sx={{ color: upnColor(r.privilegedUsername) ?? "text.secondary", overflowWrap: "anywhere" }}>{r.privilegedUsername ? <>{`${r.privilegedUsername}@${domain}`}{existing(r.privilegedUsername) && <AccountState existing />}</> : "—"}</TableCell>
                  <TableCell data-label="Display name" data-sensitive="true" sx={{ color: "text.secondary" }}>{r.privilegedDisplayName || "—"}</TableCell>
                  {/* The adm_ account's manager is always this admin's user account. */}
                  <TableCell data-label="Manager" data-sensitive="true" sx={{ color: "text.secondary", overflowWrap: "anywhere" }}>{r.username ? `${r.username}@${domain}` : "User account"}</TableCell>
                  {/* Deprecated: the adm_ account's manager is always its user account, so there's nothing to pick; kept for reference.
                  <TableCell>
                    <ManagerPicker
                      label={`User ${index + 1} privileged account manager`}
                      self={a.key}
                      privileged
                      value={a.privilegedManager}
                      admins={admins}
                      existing={existingAdmins ?? []}
                      search={searchUsers}
                      onChange={(privilegedManager) => updateAdmin(a.key, { privilegedManager })}
                      disabled={running}
                    />
                  </TableCell> */}
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </Box>
      )}
    </Box>
  );
}
