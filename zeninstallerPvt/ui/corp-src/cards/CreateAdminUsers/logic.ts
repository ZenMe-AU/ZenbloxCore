/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// The card's pure logic: the rows, their names and their checks. No React, no requests.

import type { AdminPair, EntraUser } from "../../api/azureGraph";
import { createRandomUuid } from "../../logic/randomUuid";

// A manager of the same kind: another admin in this list (their matching account), or an existing Entra user.
export type ManagerChoice = { kind: "row"; key: string } | ({ kind: "entra" } & EntraUser);

export type AdminRow = {
  key: string;
  givenName: string; // Legal name, as on the passport.
  surname: string;
  mobile: string;
  employeeId: string; // The same on both accounts.
  displayName: string | null; // Null follows the default; the same for username.
  username: string | null; // The user account's UPN, before the @; the privileged account is always adm_ + this.
  domain: string | null; // After the @, for both accounts; null for the primary domain.
  manager: ManagerChoice | null; // The user account's manager; null for the signed-in user. Another admin in this list must be above this one.
  // privilegedManager: ManagerChoice | null; // Deprecated: the adm_ account's manager is always its user account; kept for reference.
};

export type ResolvedAdmin = { displayName: string; username: string; privilegedUsername: string; privilegedDisplayName: string };

const toUpnPart = (name: string) =>
  name.normalize("NFD").replace(/\p{M}/gu, "").trim().split(/\s+/).join(".").replace(/[^A-Za-z0-9._-]/g, "");

// Legal names give the display name ("First Surname"), the display name gives the UPN (First.Surname), and the UPN gives adm_First.Surname.
export function resolveAdmin(a: AdminRow): ResolvedAdmin {
  const displayName = a.displayName ?? `${a.givenName.trim()} ${a.surname.trim()}`.trim();
  const username = a.username ?? toUpnPart(displayName);
  return {
    displayName,
    username,
    privilegedUsername: username ? `adm_${username}` : "",
    privilegedDisplayName: displayName.trim() ? `${displayName.trim()} Admin` : "",
  };
}

const USERNAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
const MOBILE = /^\+?[0-9][0-9 ()-]{5,19}$/;

export const newAdmin = (): AdminRow => ({
  key: createRandomUuid(),
  givenName: "",
  surname: "",
  mobile: "",
  employeeId: "",
  displayName: null,
  username: null,
  domain: null,
  manager: null,
  // privilegedManager: null, // Deprecated: the adm_ account's manager is always its user account; kept for reference.
});

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// The row's user and adm_ UPNs; none until it has a name and a domain.
export function rowUpns(a: AdminRow, primaryDomain: string): string[] {
  const r = resolveAdmin(a);
  const domain = a.domain ?? primaryDomain;
  return r.username.trim() && domain ? [`${r.username.trim()}@${domain}`, `${r.privilegedUsername.trim()}@${domain}`] : [];
}

// Each row with a UPN an earlier row already uses: that UPN, before the @, as typed, and the earlier row's number.
export function duplicateUpns(admins: AdminRow[]): Record<string, { upn: string; row: number }> {
  const seen = new Map<string, number>();
  const duplicates: Record<string, { upn: string; row: number }> = {};
  admins.forEach((a, i) => {
    const r = resolveAdmin(a);
    const names = [r.username, r.privilegedUsername].map((n) => n.trim()).filter(Boolean);
    const upn = names.find((n) => seen.has(n.toLowerCase()));
    if (upn) duplicates[a.key] = { upn, row: seen.get(upn.toLowerCase()) ?? 0 };
    for (const n of names) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), i + 1);
  });
  return duplicates;
}

// existing: admins already in Entra; their employee IDs are taken, except by a rerun for the same user account.
export function adminRowErrors(admins: AdminRow[], existing: readonly AdminPair[] = [], primaryDomain = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  // const seen = new Set<string>(); // Deprecated: duplicateUpns finds the repeats; kept for reference.
  const duplicates = duplicateUpns(admins);
  const employeeIds = new Set<string>();
  for (const a of admins) {
    const r = resolveAdmin(a);
    // const names = [r.username, r.privilegedUsername].map((n) => n.trim().toLowerCase()); // Deprecated: duplicateUpns finds the repeats; kept for reference.
    const duplicate = duplicates[a.key];
    const employeeId = a.employeeId.trim().toLowerCase();
    const upn = `${r.username.trim()}@${a.domain ?? primaryDomain}`.toLowerCase();
    const owner = !!(a.domain ?? primaryDomain) && existing.find((x) => x.user.employeeId?.trim().toLowerCase() === employeeId && x.user.userPrincipalName.toLowerCase() !== upn);
    if (!a.givenName.trim() || !a.surname.trim()) errors[a.key] = "Enter the first name and surname.";
    else if (!MOBILE.test(a.mobile.trim())) errors[a.key] = "Enter a mobile number, e.g. +61 400 000 000.";
    else if (!a.employeeId.trim()) errors[a.key] = "Enter the employee ID.";
    else if (employeeIds.has(a.employeeId.trim().toLowerCase())) errors[a.key] = "Each admin needs their own employee ID.";
    else if (owner) errors[a.key] = `Employee ID ${a.employeeId.trim()} belongs to ${owner.user.userPrincipalName}, an existing admin.`;
    else if (!r.displayName.trim()) errors[a.key] = "Enter a display name.";
    else if (!USERNAME.test(r.username.trim())) errors[a.key] = "Use letters, numbers, dots, hyphens or underscores in the UPN.";
    // else if (names.some((n) => seen.has(n))) errors[a.key] = "Each account needs its own UPN."; // Deprecated: the error names the UPN and the other row now; kept for reference.
    else if (duplicate) errors[a.key] = `User ${duplicate.row} already uses ${duplicate.upn}; each account needs its own UPN.`;
    // else if ([a.manager, a.privilegedManager].some((m) => m?.kind === "row" && !admins.some((o) => o.key === m.key))) errors[a.key] = "Pick another manager; that user was removed."; // Deprecated: only the user account has a pick; kept for reference.
    else if ([a.manager].some((m) => m?.kind === "row" && !admins.some((o) => o.key === m.key))) errors[a.key] = "Pick another manager; that user was removed.";
    // for (const n of names) seen.add(n); // Deprecated: duplicateUpns finds the repeats; kept for reference.
    employeeIds.add(a.employeeId.trim().toLowerCase());
  }
  return errors;
}

// A warning, not an error: a rerun finds the accounts it already made.
export function adminRowWarnings(admins: AdminRow[], primaryDomain: string, takenUpns: Set<string>, rowErrors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(admins.flatMap((a) => {
    const existing = rowUpns(a, primaryDomain).filter((upn) => takenUpns.has(upn.toLowerCase()));
    return existing.length && !rowErrors[a.key] ? [[a.key, `Already in Entra: ${existing.join(", ")}. Running reuses ${existing.length > 1 ? "these accounts" : "this account"} instead of creating one.`]] : [];
  }));
}
