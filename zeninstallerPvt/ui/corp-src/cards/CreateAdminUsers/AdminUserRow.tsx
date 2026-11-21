/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, ButtonBase, IconButton, InputAdornment, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import InfoTip from "../../components/InfoTip";
import type { VerifiedDomain } from "../../api/azureGraph";
import ManagerPicker from "./ManagerPicker";
import { Arrow } from "./RowParts";
import { box, circle, head, header } from "./styles";
import { resolveAdmin, type AdminRow } from "./logic";
import type { UseCreateAdminUsersCard } from "./useCreateAdminUsersCard";

// Shown only once a generated value was changed by hand.
function ResetButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <IconButton aria-label={label} title={label} size="small" onClick={onClick} disabled={disabled} sx={{ color: "primary.main" }}>
      <UndoIcon sx={{ typography: "body2" }} />
    </IconButton>
  );
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
  const { admins, rowErrors, rowWarnings, duplicateUpns, takenUpns, updateAdmin, removeAdmin, searchUsers, signedInUser, domains, primaryDomain, existingAndWaitingAdmins, licenceError, running, consentRequired } = adminUsers;
  const r = resolveAdmin(a);
  const defaultName = resolveAdmin({ ...a, displayName: null }).displayName;
  const defaultUpn = resolveAdmin({ ...a, username: null }).username;
  const domain = a.domain ?? primaryDomain;
  // Red for a UPN an earlier row uses, amber for one Entra already has.
  const upnColor = (name: string) =>
    duplicateUpns[a.key]?.upn === name.trim() ? "error.main" : takenUpns.has(`${name.trim()}@${domain}`.toLowerCase()) ? "warning.dark" : undefined;
  // Consent has its own notice.
  const domainNote = domains || consentRequired ? null : licenceError ? `Couldn't read the domains: ${licenceError}` : "Reading the domains...";
  return (
    <Box sx={box}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <ButtonBase aria-expanded={open} aria-controls={`admin-user-${a.key}`} disableRipple onClick={onToggle} sx={{ ...header, flex: 1, minWidth: 0 }}>
          <Box sx={circle}>{index + 1}</Box>
          <Typography data-sensitive="true" color={r.displayName.trim() ? "text.primary" : "text.muted"} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
            {r.displayName.trim() || "New user"}
          </Typography>
          {r.username && (
            <Typography data-sensitive="true" color="text.muted" noWrap>
              {r.username}@{domain}
            </Typography>
          )}
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
          <Arrow open={open} />
        </ButtonBase>
        <IconButton aria-label={`Remove user ${index + 1}`} size="small" onClick={() => removeAdmin(a.key)} disabled={running} sx={{ mx: 0.75 }}>
          <CloseIcon sx={{ typography: "body2" }} />
        </IconButton>
      </Box>
      {open && (
        <Box id={`admin-user-${a.key}`} sx={{ borderTop: "1px solid", borderColor: "divider", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              size="small"
              label="First name"
              value={a.givenName}
              onChange={(e) => updateAdmin(a.key, { givenName: e.target.value })}
              inputProps={{ "data-sensitive": true }}
              disabled={running}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Surname"
              value={a.surname}
              onChange={(e) => updateAdmin(a.key, { surname: e.target.value })}
              inputProps={{ "data-sensitive": true }}
              disabled={running}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Mobile number"
              type="tel"
              autoComplete="off"
              placeholder="+61 400 000 000"
              value={a.mobile}
              onChange={(e) => updateAdmin(a.key, { mobile: e.target.value })}
              inputProps={{ "data-sensitive": true }}
              disabled={running}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Employee ID"
              autoComplete="off"
              value={a.employeeId}
              onChange={(e) => updateAdmin(a.key, { employeeId: e.target.value })}
              inputProps={{ maxLength: 16, "data-sensitive": true }} // Graph's limit.
              disabled={running}
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 800, tableLayout: "fixed" }}>
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
                      <TableCell>
                        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5 }}>
                          <TextField
                            size="small"
                            value={r.username}
                            onChange={(e) => updateAdmin(a.key, { username: e.target.value })}
                            disabled={running}
                            error={upnColor(r.username) === "error.main"}
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
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          value={r.displayName}
                          onChange={(e) => updateAdmin(a.key, { displayName: e.target.value })}
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
                      <TableCell data-sensitive="true" sx={{ color: upnColor(r.username) ?? "text.secondary", overflowWrap: "anywhere" }}>{r.username ? `${r.username}@${domain}` : "—"}</TableCell>
                      <TableCell data-sensitive="true" sx={{ color: "text.secondary" }}>{r.displayName || "—"}</TableCell>
                    </>
                  )}
                  <TableCell>
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
                  <TableCell data-sensitive="true" sx={{ color: upnColor(r.privilegedUsername) ?? "text.secondary", overflowWrap: "anywhere" }}>{r.privilegedUsername ? `${r.privilegedUsername}@${domain}` : "—"}</TableCell>
                  <TableCell data-sensitive="true" sx={{ color: "text.secondary" }}>{r.privilegedDisplayName || "—"}</TableCell>
                  {/* The adm_ account's manager is always this admin's user account. */}
                  <TableCell data-sensitive="true" sx={{ color: "text.secondary", overflowWrap: "anywhere" }}>{r.username ? `${r.username}@${domain}` : "User account"}</TableCell>
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
