/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { Autocomplete, TextField } from "@mui/material";
import type { AdminPair, EntraUser } from "../../api/azureGraph";
import { resolveAdmin, type AdminRow, type ManagerChoice } from "./useCreateAdminUsersCard";

function managerLabel(m: ManagerChoice, admins: AdminRow[], privileged: boolean): string {
  if (m.kind === "entra") return m.displayName;
  const row = admins.find((o) => o.key === m.key);
  if (!row) return "Removed user";
  const r = resolveAdmin(row);
  return (privileged ? r.privilegedDisplayName : r.displayName.trim()) || "New user";
}

const sameManager = (a: ManagerChoice, b: ManagerChoice) =>
  a.kind === b.kind && (a.kind === "row" ? a.key === (b as typeof a).key : a.id === (b as typeof a).id);

// Another admin in this list (new or existing), or an Entra user found by name or UPN, of the same kind (adm_ or not); empty means no manager.
export default function ManagerPicker({ label, self, privileged, value, admins, existing, search, onChange, disabled }: {
  label: string;
  self: string;
  privileged: boolean;
  value: ManagerChoice | null;
  admins: AdminRow[];
  existing: AdminPair[];
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
  // An existing admin's account of the same kind.
  const listed = existing.map((x) => (privileged ? x.privileged : x.user));
  const listedIds = new Set(listed.map((u) => u.id));
  const options: ManagerChoice[] = [
    ...admins.filter((o) => o.key !== self).map((o) => ({ kind: "row" as const, key: o.key })),
    ...listed.map(({ id, displayName, userPrincipalName }) => ({ kind: "entra" as const, id, displayName, userPrincipalName })),
    ...(q.length >= 2 && found.query === q ? found.users : [])
      .filter((u) => /^adm_/i.test(u.userPrincipalName) === privileged && !listedIds.has(u.id))
      .map((u) => ({ kind: "entra" as const, ...u })),
  ];
  const inList = (m: ManagerChoice) => m.kind === "row" || listedIds.has(m.id);
  // Keeps a picked Entra user listed after the search results change.
  if (value && !options.some((o) => sameManager(o, value))) options.push(value);
  const text = (m: ManagerChoice) => (m.kind === "entra" ? `${m.displayName} (${m.userPrincipalName})` : managerLabel(m, admins, privileged));
  return (
    <Autocomplete
      size="small"
      options={options}
      value={value}
      onChange={(_, m) => onChange(m)}
      onInputChange={(_, v, reason) => setQuery(reason === "input" ? v : "")}
      groupBy={(m) => (inList(m) ? "In this list" : "Entra users")}
      getOptionLabel={text}
      isOptionEqualToValue={sameManager}
      filterOptions={(opts, { inputValue }) => opts.filter((m) => !inList(m) || text(m).toLowerCase().includes(inputValue.trim().toLowerCase()))}
      noOptionsText="Type a name or UPN to search Entra"
      disabled={disabled}
      renderInput={(params) => <TextField {...params} placeholder="No manager" inputProps={{ ...params.inputProps, "aria-label": label, "data-sensitive": true }} />}
    />
  );
}
