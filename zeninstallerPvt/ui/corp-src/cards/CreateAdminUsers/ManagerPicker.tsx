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

// What an empty pick means: the signed-in user, or this admin's user account. id is the Entra user it is, so it isn't listed twice.
export type ManagerFallback = { label: string; group: string; id?: string };

// The fallback stands in for a null pick.
type Option = ManagerChoice | { kind: "fallback" };
const FALLBACK: Option = { kind: "fallback" };

const sameManager = (a: Option, b: Option) =>
  a.kind === b.kind && (a.kind === "fallback" || (a.kind === "row" ? a.key === (b as typeof a).key : a.id === (b as typeof a).id));

// The fallback, an admin above this one in the list or already in Entra, or an Entra user found by name or UPN, of the same kind (adm_ or not).
export default function ManagerPicker({ label, self, privileged, value, fallback, admins, existing, search, onChange, disabled }: {
  label: string;
  self: string;
  privileged: boolean;
  value: ManagerChoice | null;
  fallback: ManagerFallback | null; // Null until it's known.
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
  const listed = existing.map((x) => (privileged ? x.privileged : x.user)).filter((u) => u.id !== fallback?.id);
  const listedIds = new Set([...listed.map((u) => u.id), ...(fallback?.id ? [fallback.id] : [])]);
  // Only admins above, so each manager is created before their reports.
  const above = admins.slice(0, Math.max(0, admins.findIndex((o) => o.key === self)));
  const options: Option[] = [
    ...(fallback ? [FALLBACK] : []),
    ...above.map((o) => ({ kind: "row" as const, key: o.key })),
    ...listed.map(({ id, displayName, userPrincipalName }) => ({ kind: "entra" as const, id, displayName, userPrincipalName })),
    ...(q.length >= 2 && found.query === q ? found.users : [])
      .filter((u) => /^adm_/i.test(u.userPrincipalName) === privileged && !listedIds.has(u.id))
      .map((u) => ({ kind: "entra" as const, ...u })),
  ];
  const inList = (m: Option) => m.kind !== "entra" || listedIds.has(m.id);
  // Keeps a picked Entra user listed after the search results change.
  if (value && !options.some((o) => sameManager(o, value))) options.push(value);
  const text = (m: Option) =>
    m.kind === "fallback" ? (fallback?.label ?? "") : m.kind === "entra" ? `${m.displayName} (${m.userPrincipalName})` : managerLabel(m, admins, privileged);
  return (
    <Autocomplete
      size="small"
      options={options}
      value={value ?? (fallback ? FALLBACK : null)}
      onChange={(_, m) => onChange(m && m.kind !== "fallback" ? m : null)}
      disableClearable={!value} // Clearing goes back to the fallback.
      onInputChange={(_, v, reason) => setQuery(reason === "input" ? v : "")}
      groupBy={(m) => (m.kind === "fallback" ? (fallback?.group ?? "") : inList(m) ? "In this list" : "Entra users")}
      getOptionLabel={text}
      isOptionEqualToValue={sameManager}
      filterOptions={(opts, { inputValue }) => opts.filter((m) => !inList(m) || text(m).toLowerCase().includes(inputValue.trim().toLowerCase()))}
      noOptionsText="Type a name or UPN to search Entra"
      disabled={disabled}
      renderInput={(params) => <TextField {...params} placeholder="Signed-in user" inputProps={{ ...params.inputProps, "aria-label": label, "data-sensitive": true }} />}
    />
  );
}
