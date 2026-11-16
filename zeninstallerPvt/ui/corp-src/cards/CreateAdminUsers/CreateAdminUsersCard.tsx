/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Fragment, useEffect, useState, type ReactElement } from "react";
import {
  Autocomplete,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import UndoIcon from "@mui/icons-material/Undo";
import Card from "../../components/Card";
import ErrorText from "../../components/ErrorText";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import AzureAccessCheck from "../../components/AzureAccessCheck";
import StatusText from "../../components/StatusText";
import WarningNotice from "../../components/WarningNotice";
import StepRow from "../StepRow";
import type { EntraLicence, EntraUser } from "../../api/azureGraph";
import type { CardChrome } from "../../types";
import {
  ADMIN_GROUPS,
  CREATE_ADMIN_USERS_TITLE,
  LICENCE_LABEL,
  PIM_OPTION,
  groupRoleLabel,
  licenceAllows,
  type LicenceState,
} from "./config";
import { resolveAdmin, type AdminRow, type ManagerChoice, type UseCreateAdminUsersCard } from "./useCreateAdminUsersCard";

type Props = {
  card: CardChrome;
  adminUsers: UseCreateAdminUsersCard;
  dnsName: string;
};

const box = { border: "1px solid", borderColor: "divider", borderRadius: 1, backgroundColor: "background.paper", overflow: "hidden" };
const header = { width: "100%", justifyContent: "flex-start", gap: 1.25, px: 1.5, py: 1, textAlign: "left", "&:hover": { backgroundColor: "action.hover" } };
const head = { color: "text.primary", fontWeight: 700 };
const circle = {
  width: 24,
  height: 24,
  flex: "none",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  bgcolor: "primary.main",
  color: "primary.contrastText",
  typography: "body2",
};
const GROUP_NAMES = ADMIN_GROUPS.map((g) => g.name);

const INTRO_POINTS = [
  "Creates the security groups, with their nesting and roles.",
  "Each admin gets a cloud-only user account, plus a privileged adm_ account when ticked.",
  "Needs Global Administrator in Entra, and Owner or User Access Administrator on the subscription and the tenant root management group.",
];

function Intro() {
  return (
    <Box>
      <Typography variant="body1" color="text.secondary">
        Sets up your organisation's admin groups and accounts in Entra.
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 3, color: "text.secondary" }}>
        {INTRO_POINTS.map((point) => (
          <Typography key={point} component="li" variant="body1">
            {point}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

// A bordered option, greyed out until the licence allows it.
function LicenceOption({ value, control, option, licence, selected, running }: {
  value?: string;
  control: ReactElement;
  option: { label: string; description: string; needs: EntraLicence };
  licence: LicenceState;
  selected: boolean;
  running: boolean;
}) {
  const allowed = licenceAllows(option.needs, licence);
  const known = licence !== null && licence !== "unknown";
  return (
    <FormControlLabel
      value={value}
      disabled={running || !allowed}
      control={control}
      sx={{ ...box, m: 0, pr: 1.5, py: 0.75, alignItems: "flex-start", borderColor: selected ? "primary.main" : "divider", backgroundColor: allowed ? "background.paper" : "action.hover" }}
      label={
        <Box sx={{ pt: 0.75 }}>
          <Typography color={allowed ? "text.primary" : "text.disabled"} sx={{ fontWeight: 700 }}>
            {option.label}
            {option.needs !== "none" && (
              <Chip
                size="small"
                variant="outlined"
                color={allowed ? "primary" : "default"}
                label={known && !allowed ? `Needs ${LICENCE_LABEL[option.needs]}` : LICENCE_LABEL[option.needs]}
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
          <Typography color={allowed ? "text.secondary" : "text.disabled"}>{option.description}</Typography>
        </Box>
      }
    />
  );
}

function Arrow({ open }: { open: boolean }) {
  return <KeyboardArrowDownIcon aria-hidden="true" sx={{ ml: "auto", color: "text.muted", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />;
}

// Shown only once a generated value was changed by hand.
function ResetButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <IconButton aria-label={label} title={label} size="small" onClick={onClick} disabled={disabled} sx={{ color: "primary.main" }}>
      <UndoIcon sx={{ typography: "body2" }} />
    </IconButton>
  );
}

function GroupPicker({ label, value, onChange, disabled }: { label: string; value: string[]; onChange: (groups: string[]) => void; disabled: boolean }) {
  return (
    <Autocomplete
      multiple
      size="small"
      disableCloseOnSelect
      options={GROUP_NAMES}
      value={value}
      onChange={(_, groups) => onChange(groups)}
      disabled={disabled}
      renderInput={(params) => <TextField {...params} placeholder={value.length ? undefined : "No groups"} inputProps={{ ...params.inputProps, "aria-label": label }} />}
    />
  );
}

function managerLabel(m: ManagerChoice, admins: AdminRow[]): string {
  if (m.kind === "entra") return m.displayName;
  const row = admins.find((o) => o.key === m.key);
  return row ? resolveAdmin(row).displayName.trim() || "New user" : "Removed user";
}

const sameManager = (a: ManagerChoice, b: ManagerChoice) =>
  a.kind === b.kind && (a.kind === "row" ? a.key === (b as typeof a).key : a.id === (b as typeof a).id);

// Another admin in this list, or an Entra user found by name or UPN; empty means no manager.
function ManagerPicker({ label, self, value, admins, search, onChange, disabled }: {
  label: string;
  self: string;
  value: ManagerChoice | null;
  admins: AdminRow[];
  search: (query: string) => Promise<EntraUser[]>;
  onChange: (manager: ManagerChoice | null) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; users: EntraUser[] }>({ query: "", users: [] });
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => search(q).then((users) => !cancelled && setFound({ query: q, users }), () => !cancelled && setFound({ query: q, users: [] })), 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, search]);
  const options: ManagerChoice[] = [
    ...admins.filter((o) => o.key !== self).map((o) => ({ kind: "row" as const, key: o.key })),
    ...(q.length >= 2 && found.query === q ? found.users : []).map((u) => ({ kind: "entra" as const, ...u })),
  ];
  // Keeps a picked Entra user listed after the search results change.
  if (value && !options.some((o) => sameManager(o, value))) options.push(value);
  const text = (m: ManagerChoice) => (m.kind === "entra" ? `${m.displayName} (${m.userPrincipalName})` : managerLabel(m, admins));
  return (
    <Autocomplete
      size="small"
      options={options}
      value={value}
      onChange={(_, m) => onChange(m)}
      onInputChange={(_, v, reason) => setQuery(reason === "input" ? v : "")}
      groupBy={(m) => (m.kind === "row" ? "In this list" : "Entra users")}
      getOptionLabel={text}
      isOptionEqualToValue={sameManager}
      filterOptions={(opts, { inputValue }) => opts.filter((m) => m.kind === "entra" || text(m).toLowerCase().includes(inputValue.trim().toLowerCase()))}
      noOptionsText="Type a name or UPN to search Entra"
      disabled={disabled}
      renderInput={(params) => <TextField {...params} placeholder="No manager" inputProps={{ ...params.inputProps, "aria-label": label }} />}
    />
  );
}

export default function CreateAdminUsersCard({ card, adminUsers, dnsName }: Props) {
  const { admins, rowErrors, addAdmin, updateAdmin, removeAdmin, searchUsers, missingGroups, entraLicence, roleTarget, usePim, setUsePim, access, steps, running, canRun, run, reset, consentRequired, requestConsent, error } =
    adminUsers;
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(() => admins[0]?.key ?? null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const incomplete = admins.filter((a) => rowErrors[a.key]).length;
  const groupSummary = error ? "Couldn't read Entra" : !missingGroups ? "Checking..." : `${missingGroups.length} to create · ${ADMIN_GROUPS.length - missingGroups.length} existing`;

  return (
    <Card title={CREATE_ADMIN_USERS_TITLE} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />
        {consentRequired && (
          <WarningNotice message="ZenInstaller needs your consent to manage Entra groups, users and directory roles.">
            <Button size="small" variant="outlined" onClick={() => void requestConsent()} sx={{ alignSelf: "flex-start" }}>
              Grant permissions
            </Button>
          </WarningNotice>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography color="text.muted">Is Entra Privileged Identity Management (PIM) available?</Typography>
          <LicenceOption
            control={<Checkbox size="small" checked={usePim} onChange={(e) => setUsePim(e.target.checked)} />}
            option={PIM_OPTION}
            licence={entraLicence}
            selected={usePim}
            running={running}
          />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography variant="sectionLabel">Security groups</Typography>
            <Typography color="text.muted">{groupSummary}</Typography>
          </Box>
          {ADMIN_GROUPS.map((g) => {
            const open = openGroup === g.name;
            const toCreate = missingGroups?.includes(g.name);
            const exists = !!missingGroups && !toCreate; // Greyed out, but still opens.
            const summary = [
              ...(g.memberOf.length ? [`member of ${g.memberOf.join(", ")}`] : []),
              ...(g.roles.length ? [`${g.roles.length} role${g.roles.length > 1 ? "s" : ""}`] : []),
            ].join(" · ");
            const details: [string, string][] = [
              ["Description", g.description],
              ["Member of", g.memberOf.join(", ") || "—"],
              ["Roles", g.roles.map((role) => groupRoleLabel(g, role, roleTarget, usePim)).join(", ") || "—"],
              ["Role-assignable", g.roleAssignable && roleTarget === "group" ? "Yes" : "No"],
            ];
            return (
              <Box key={g.name} sx={exists ? { ...box, backgroundColor: "action.hover" } : box}>
                <ButtonBase aria-expanded={open} onClick={() => setOpenGroup(open ? null : g.name)} sx={header}>
                  <Typography color={exists ? "text.disabled" : "text.primary"} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                    {g.name}
                  </Typography>
                  {summary && (
                    <Typography color={exists ? "text.disabled" : "text.muted"} noWrap>
                      {summary}
                    </Typography>
                  )}
                  {missingGroups && <Chip size="small" variant="outlined" color={toCreate ? "primary" : "default"} label={toCreate ? "Create" : "Exists"} sx={exists ? { color: "text.disabled" } : undefined} />}
                  <Arrow open={open} />
                </ButtonBase>
                {open && (
                  <Box sx={{ borderTop: "1px solid", borderColor: "divider", p: 1.5, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 3, rowGap: 0.5 }}>
                    {details.map(([label, value]) => (
                      <Fragment key={label}>
                        <Typography color="text.muted">{label}</Typography>
                        <Typography color="text.secondary">{value}</Typography>
                      </Fragment>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography variant="sectionLabel">User accounts</Typography>
            <Typography color="text.muted">
              {admins.length} to add ·{" "}
              <Box component="span" sx={incomplete ? { color: "error.main" } : undefined}>
                {incomplete} incomplete
              </Box>
            </Typography>
          </Box>
          {admins.length === 0 && <Typography color="text.muted">No users. Running the card only creates the groups.</Typography>}
          {admins.map((a, index) => {
            const r = resolveAdmin(a);
            const open = openKey === a.key;
            const defaultName = resolveAdmin({ ...a, displayName: null }).displayName;
            const defaultUpn = resolveAdmin({ ...a, username: null }).username;
            const off = a.privileged ? "text.secondary" : "text.disabled";
            const editing = editKey === a.key;
            return (
              <Box key={a.key} sx={box}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <ButtonBase aria-expanded={open} onClick={() => setOpenKey(open ? null : a.key)} sx={{ ...header, flex: 1, minWidth: 0 }}>
                    <Box sx={circle}>{index + 1}</Box>
                    <Typography color={r.displayName.trim() ? "text.primary" : "text.muted"} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      {r.displayName.trim() || "New user"}
                    </Typography>
                    {r.username && (
                      <Typography color="text.muted" noWrap>
                        {r.username}@{dnsName}
                      </Typography>
                    )}
                    {a.privileged && <Chip size="small" variant="outlined" color="primary" label="Privileged" />}
                    {rowErrors[a.key] && (
                      <Typography color="error.main" noWrap sx={{ minWidth: 0 }}>
                        {rowErrors[a.key]}
                      </Typography>
                    )}
                    <Arrow open={open} />
                  </ButtonBase>
                  <IconButton aria-label={`Remove user ${index + 1}`} size="small" onClick={() => removeAdmin(a.key)} disabled={running} sx={{ mx: 0.75 }}>
                    <CloseIcon sx={{ typography: "body2" }} />
                  </IconButton>
                </Box>
                {open && (
                  <Box sx={{ borderTop: "1px solid", borderColor: "divider", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <TextField
                        size="small"
                        label="First name"
                        value={a.givenName}
                        onChange={(e) => updateAdmin(a.key, { givenName: e.target.value })}
                        disabled={running}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        size="small"
                        label="Surname"
                        value={a.surname}
                        onChange={(e) => updateAdmin(a.key, { surname: e.target.value })}
                        disabled={running}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        size="small"
                        label="Mobile number (optional)"
                        type="tel"
                        autoComplete="off"
                        placeholder="+61 400 000 000"
                        value={a.mobile}
                        onChange={(e) => updateAdmin(a.key, { mobile: e.target.value })}
                        disabled={running}
                        sx={{ flex: 1 }}
                      />
                    </Box>
                    <Box sx={{ overflowX: "auto" }}>
                      <Table size="small" sx={{ minWidth: 1000, tableLayout: "fixed" }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ ...head, width: 200 }}>Account</TableCell>
                            <TableCell sx={{ ...head, width: "24%" }}>UPN</TableCell>
                            <TableCell sx={{ ...head, width: "13%" }}>Display name</TableCell>
                            <TableCell sx={{ ...head, width: "16%" }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                Manager
                                <Tooltip title="Only their manager can give them an Access Pass.">
                                  <InfoOutlinedIcon aria-hidden="true" sx={{ typography: "body2", color: "text.muted" }} />
                                </Tooltip>
                              </Box>
                            </TableCell>
                            <TableCell sx={head}>Groups</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell sx={{ color: "text.primary", whiteSpace: "nowrap" }}>
                              User account
                              <Button
                                size="small"
                                aria-label={editing ? `Done editing user ${index + 1}` : `Edit user ${index + 1}'s UPN and display name`}
                                onClick={() => setEditKey(editing ? null : a.key)}
                                disabled={running}
                                sx={{ ml: 1, minWidth: 0 }}
                              >
                                {editing ? "Done" : "Edit"}
                              </Button>
                            </TableCell>
                            {editing ? (
                              <>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    value={r.username}
                                    onChange={(e) => updateAdmin(a.key, { username: e.target.value })}
                                    disabled={running}
                                    inputProps={{ "aria-label": `User ${index + 1} UPN` }}
                                    InputProps={{
                                      endAdornment: (
                                        <InputAdornment position="end">
                                          {a.username !== null && a.username !== defaultUpn && (
                                            <ResetButton label={`Reset UPN to ${defaultUpn}`} onClick={() => updateAdmin(a.key, { username: null })} disabled={running} />
                                          )}
                                          @{dnsName}
                                        </InputAdornment>
                                      ),
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    value={r.displayName}
                                    onChange={(e) => updateAdmin(a.key, { displayName: e.target.value })}
                                    disabled={running}
                                    inputProps={{ "aria-label": `User ${index + 1} display name` }}
                                    InputProps={{
                                      endAdornment: a.displayName !== null && a.displayName !== defaultName && (
                                        <InputAdornment position="end">
                                          <ResetButton
                                            label={`Reset display name to ${defaultName}`}
                                            onClick={() => updateAdmin(a.key, { displayName: null })}
                                            disabled={running}
                                          />
                                        </InputAdornment>
                                      ),
                                    }}
                                  />
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell sx={{ color: "text.secondary", overflowWrap: "anywhere" }}>{r.username ? `${r.username}@${dnsName}` : "—"}</TableCell>
                                <TableCell sx={{ color: "text.secondary" }}>{r.displayName || "—"}</TableCell>
                              </>
                            )}
                            <TableCell>
                              <ManagerPicker
                                label={`User ${index + 1} manager`}
                                self={a.key}
                                value={a.manager}
                                admins={admins}
                                search={searchUsers}
                                onChange={(manager) => updateAdmin(a.key, { manager })}
                                disabled={running}
                              />
                            </TableCell>
                            <TableCell>
                              <GroupPicker
                                label={`User ${index + 1} user account groups`}
                                value={a.userGroups}
                                onChange={(userGroups) => updateAdmin(a.key, { userGroups })}
                                disabled={running}
                              />
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>
                              <FormControlLabel
                                sx={{ whiteSpace: "nowrap" }}
                                control={<Checkbox size="small" checked={a.privileged} onChange={(e) => updateAdmin(a.key, { privileged: e.target.checked })} disabled={running} />}
                                label={<Typography color="text.primary">Privileged account</Typography>}
                              />
                            </TableCell>
                            <TableCell sx={{ color: off, overflowWrap: "anywhere" }}>{r.privilegedUsername ? `${r.privilegedUsername}@${dnsName}` : "—"}</TableCell>
                            <TableCell sx={{ color: off }}>{r.privilegedDisplayName || "—"}</TableCell>
                            <TableCell sx={{ color: off }}>—</TableCell>
                            <TableCell>
                              <GroupPicker
                                label={`User ${index + 1} privileged account groups`}
                                value={a.privilegedGroups}
                                onChange={(privilegedGroups) => updateAdmin(a.key, { privilegedGroups })}
                                disabled={running || !a.privileged}
                              />
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
          <Box sx={box}>
            <ButtonBase onClick={() => setOpenKey(addAdmin())} disabled={running} sx={header}>
              <Box sx={circle}>
                <AddIcon sx={{ typography: "body2" }} />
              </Box>
              <Typography color="text.secondary" sx={{ fontWeight: 700 }}>
                Add user
              </Typography>
            </ButtonBase>
          </Box>
        </Box>

        {!dnsName && <WarningNotice message="Save the DNS variable first: admin accounts are created on the corp domain." />}
        <AzureAccessCheck access={access} resourceAccess />
        {error && <ErrorText>Couldn't read the groups from Entra: {error}</ErrorText>}

        {steps.length === 0 ? (
          <Button variant="contained" onClick={() => void run()} disabled={!canRun} sx={{ alignSelf: "flex-start", py: 0.85, px: 2.5 }}>
            {admins.length ? "Create groups and admin accounts" : "Create groups"}
          </Button>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {running && <StatusText>Running...</StatusText>}
            <ProcessRetryNotice started />
            {!running && (
              <Button size="small" onClick={reset} sx={{ alignSelf: "flex-start", mt: 0.5, color: "text.muted", "&:hover": { color: "primary.main" } }}>
                ↩ Start over
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Card>
  );
}
