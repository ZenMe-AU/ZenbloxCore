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
  manager: ManagerChoice | null; // The user account's manager; null for the signed-in user. Another admin in this list may be anywhere in it; the run makes managers first.
  // privilegedManager: ManagerChoice | null; // Deprecated: the adm_ account's manager is always its user account; kept for reference.
  confirmedAccountIds: string[]; // Accounts Entra already has under this row's UPNs that the operator confirmed are this person.
};

export type ResolvedAdmin = { displayName: string; username: string; privilegedUsername: string; privilegedDisplayName: string };

// An admin whose two accounts a run finished, shaped like an existing admin.
export type CreatedAdmin = AdminPair & { key: string };

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
  confirmedAccountIds: [],
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

// Whether the row's managers, followed through rows in this list, reach the target row.
export function reportsTo(admins: AdminRow[], key: string, target: string): boolean {
  const seen = new Set<string>();
  for (let row = admins.find((admin) => admin.key === key); row && !seen.has(row.key); ) {
    seen.add(row.key);
    const pick = row.manager;
    if (pick?.kind !== "row") return false;
    if (pick.key === target) return true;
    row = admins.find((admin) => admin.key === pick.key);
  }
  return false;
}

// Why the row's pick would make a loop: the manager it picked from this list already reports to it. Null if it doesn't.
export function managerLoop(admins: AdminRow[], admin: AdminRow): string | null {
  const pick = admin.manager;
  if (pick?.kind !== "row" || !reportsTo(admins, pick.key, admin.key)) return null;
  const manager = admins.find((other) => other.key === pick.key);
  const name = (manager && resolveAdmin(manager).displayName.trim()) || "That admin";
  return `${name} already reports to this admin, so they can't manage each other.`;
}

// The rows in the order the run makes them: each manager from this list before their reports, the rest as listed.
export function byManager(admins: AdminRow[]): AdminRow[] {
  const ordered: AdminRow[] = [];
  const seen = new Set<string>();
  const visit = (admin: AdminRow) => {
    if (seen.has(admin.key)) return; // Also stops a loop, which adminRowErrors blocks before a run.
    seen.add(admin.key);
    const pick = admin.manager;
    const manager = pick?.kind === "row" ? admins.find((other) => other.key === pick.key) : undefined;
    if (manager) visit(manager);
    ordered.push(admin);
  };
  admins.forEach(visit);
  return ordered;
}

// existing: admins already in Entra; their employee IDs are taken, except by a rerun for the same user account.
// takenUpns: accounts Entra already has under the rows' UPNs; reusing one needs the operator's confirmation.
// employeeIdAccounts: accounts Entra already has with the rows' employee IDs, by lowercase ID.
// Each row's first problem; adminRowIssues has them all.
export function adminRowErrors(admins: AdminRow[], existing: readonly AdminPair[] = [], primaryDomain = "", takenUpns: ReadonlyMap<string, FoundAccount> = new Map(), employeeIdAccounts: ReadonlyMap<string, FoundAccount[]> = new Map()): Record<string, string> {
  // Deprecated: adminRowIssues lists every problem with its field; this keeps the first one's message; kept for reference.
  // const errors: Record<string, string> = {};
  // // const seen = new Set<string>(); // Deprecated: duplicateUpns finds the repeats; kept for reference.
  // const duplicates = duplicateUpns(admins);
  // const employeeIds = new Set<string>();
  // for (const a of admins) {
  //   const r = resolveAdmin(a);
  //   // const names = [r.username, r.privilegedUsername].map((n) => n.trim().toLowerCase()); // Deprecated: duplicateUpns finds the repeats; kept for reference.
  //   const duplicate = duplicates[a.key];
  //   const employeeId = a.employeeId.trim().toLowerCase();
  //   const upn = `${r.username.trim()}@${a.domain ?? primaryDomain}`.toLowerCase();
  //   const loop = managerLoop(admins, a);
  //   const owner = !!(a.domain ?? primaryDomain) && existing.find((x) => x.user.employeeId?.trim().toLowerCase() === employeeId && x.user.userPrincipalName.toLowerCase() !== upn);
  //   if (!a.givenName.trim() || !a.surname.trim()) errors[a.key] = "Enter the first name and surname.";
  //   else if (!MOBILE.test(a.mobile.trim())) errors[a.key] = "Enter a mobile number, e.g. +61 400 000 000.";
  //   else if (!a.employeeId.trim()) errors[a.key] = "Enter the employee ID.";
  //   else if (employeeIds.has(a.employeeId.trim().toLowerCase())) errors[a.key] = "Each admin needs their own employee ID.";
  //   else if (owner) errors[a.key] = `Employee ID ${a.employeeId.trim()} belongs to ${owner.user.userPrincipalName}, an existing admin.`;
  //   else if (!r.displayName.trim()) errors[a.key] = "Enter a display name.";
  //   else if (!USERNAME.test(r.username.trim())) errors[a.key] = "Use letters, numbers, dots, hyphens or underscores in the UPN.";
  //   // else if (names.some((n) => seen.has(n))) errors[a.key] = "Each account needs its own UPN."; // Deprecated: the error names the UPN and the other row now; kept for reference.
  //   else if (duplicate) errors[a.key] = `User ${duplicate.row} already uses ${duplicate.upn}; each account needs its own UPN.`;
  //   // else if ([a.manager, a.privilegedManager].some((m) => m?.kind === "row" && !admins.some((o) => o.key === m.key))) errors[a.key] = "Pick another manager; that user was removed."; // Deprecated: only the user account has a pick; kept for reference.
  //   else if ([a.manager].some((m) => m?.kind === "row" && !admins.some((o) => o.key === m.key))) errors[a.key] = "Pick another manager; that user was removed.";
  //   else if (loop) errors[a.key] = `Pick another manager; ${loop}`;
  //   // for (const n of names) seen.add(n); // Deprecated: duplicateUpns finds the repeats; kept for reference.
  //   employeeIds.add(a.employeeId.trim().toLowerCase());
  // }
  // return errors;
  return Object.fromEntries(Object.entries(adminRowIssues(admins, existing, primaryDomain, takenUpns, employeeIdAccounts)).map(([key, issues]) => [key, issues[0].message]));
}

// The rows left once the created admins leave the list. A row that picked one of them as manager now points at that account in Entra.
export function withoutCreated(admins: AdminRow[], created: CreatedAdmin[]): AdminRow[] {
  return admins
    .filter((admin) => !created.some((createdAdmin) => createdAdmin.key === admin.key))
    .map((admin) => {
      const pick = admin.manager;
      const manager = pick?.kind === "row" ? created.find((createdAdmin) => createdAdmin.key === pick.key) : undefined;
      return manager ? { ...admin, manager: { kind: "entra", id: manager.user.id, displayName: manager.user.displayName, userPrincipalName: manager.user.userPrincipalName } } : admin;
    });
}

// A warning, not an error: the run reuses accounts the operator confirmed are this person.
export function adminRowWarnings(admins: AdminRow[], primaryDomain: string, takenUpns: ReadonlyMap<string, FoundAccount>, rowErrors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(admins.flatMap((a) => {
    // const existing = rowUpns(a, primaryDomain).filter((upn) => takenUpns.has(upn.toLowerCase())); // Deprecated: reusing an account now needs the operator's confirmation; kept for reference.
    // return existing.length && !rowErrors[a.key] ? [[a.key, `Already in Entra: ${existing.join(", ")}. Running reuses ${existing.length > 1 ? "these accounts" : "this account"} instead of creating one.`]] : []; // Deprecated: reusing an account now needs the operator's confirmation; kept for reference.
    const reuse = reuseCheck(a, primaryDomain, takenUpns);
    return reuse?.state === "confirmed" && !rowErrors[a.key] ? [[a.key, reuse.message]] : [];
  }));
}

// A created admin Entra doesn't list yet: preparing while the reads after the run go on, unlisted once the last one still misses them.
export type WaitingAdmin = CreatedAdmin & { status: "preparing" | "unlisted" };
export type WaitingAction = { type: "created"; admins: CreatedAdmin[] } | { type: "timedOut" };

// Every admin the runs created. They never go back to the list to add, since their accounts exist; the card hook hides the ones Entra lists.
export function waitingReducer(waiting: WaitingAdmin[], action: WaitingAction): WaitingAdmin[] {
  switch (action.type) {
    case "created":
      return [...waiting, ...action.admins.map((admin) => ({ ...admin, status: "preparing" as const }))];
    case "timedOut":
      return waiting.map((admin) => ({ ...admin, status: "unlisted" as const }));
  }
}

// An account Entra already has under one of the rows' UPNs.
export type FoundAccount = EntraUser & { employeeId: string | null };

// Whether the row may reuse the accounts Entra already has under its UPNs.
export type ReuseCheck =
  | { state: "otherPerson"; message: string } // One has another employee ID, so it's someone else: change the UPN.
  | { state: "unconfirmed"; message: string; accountIds: string[]; employeeId: string | null } // The same or no employee ID: the operator confirms it's this person. employeeId is theirs in Entra, for a row without one.
  | { state: "confirmed"; message: string };

// Null if Entra has no account under the row's UPNs.
export function reuseCheck(admin: AdminRow, primaryDomain: string, takenUpns: ReadonlyMap<string, FoundAccount>): ReuseCheck | null {
  const accounts = rowUpns(admin, primaryDomain).flatMap((upn) => takenUpns.get(upn.toLowerCase()) ?? []);
  if (!accounts.length) return null;
  const employeeId = admin.employeeId.trim();
  // Until the row has an employee ID, nobody is someone else; one typed later is checked then.
  const other = employeeId && accounts.find((account) => account.employeeId?.trim() && account.employeeId.trim().toLowerCase() !== employeeId.toLowerCase());
  if (other) return { state: "otherPerson", message: `${other.userPrincipalName} is associated with ${other.displayName}, whose Employee ID is ${other.employeeId?.trim()}, not ${employeeId}. Enter a different UPN.` };
  // A confirmation holds only for the accounts it was given for; another account under the UPN asks again.
  if (accounts.every((account) => admin.confirmedAccountIds.includes(account.id))) {
    return { state: "confirmed", message: `Reusing ${accounts.map((account) => account.userPrincipalName).join(", ")}, confirmed as this person.` };
  }
  const inEntra = accounts.find((account) => account.employeeId?.trim())?.employeeId?.trim() ?? null;
  const missing = missingAccount(rowUpns(admin, primaryDomain)[0], accounts);
  const message = missing ? `${accountNames(accounts)} is already in Entra but ${missing}` : `${accountNames(accounts)} are already in Entra. ${NOTHING_CREATED}`;
  return { state: "unconfirmed", message, accountIds: accounts.map((account) => account.id), employeeId: inEntra };
}

const NOTHING_CREATED = "If you use them, no new accounts will be created.";

// Which account of the pair Entra doesn't have, and that using the one it has creates it; null if it has both.
function missingAccount(userUpn: string, accounts: readonly FoundAccount[]): string | null {
  const [username, domain] = userUpn.split("@");
  const privilegedUpn = `adm_${username}@${domain}`;
  const has = (upn: string) => accounts.some((account) => account.userPrincipalName.toLowerCase() === upn.toLowerCase());
  if (!has(privilegedUpn)) return `doesn't have a Privileged Account yet. If you use it, ${privilegedUpn} will be created as its Privileged Account.`;
  if (!has(userUpn)) return `doesn't have a user account yet. If you use it, ${userUpn} will be created as its user account.`;
  return null;
}

const listFormat = new Intl.ListFormat("en-AU"); // "a, b and c"

// The accounts for a sentence: each person's UPNs, then their display name, e.g. "alee@corp.com and adm_alee@corp.com (Ann Lee)".
function accountNames(accounts: readonly FoundAccount[]): string {
  const upnsByName = new Map<string, string[]>();
  for (const account of accounts) upnsByName.set(account.displayName, [...(upnsByName.get(account.displayName) ?? []), account.userPrincipalName]);
  return listFormat.format([...upnsByName].map(([name, upns]) => `${listFormat.format(upns)} (${name})`));
}

// The part of a row a problem is about; that field turns red.
export type RowField = "givenName" | "surname" | "mobile" | "employeeId" | "displayName" | "upn" | "manager";

// A problem with a row: a few words for its header, the full sentence, and a fix the operator applies with one click.
// input: a field left empty or in the wrong format; shown once the operator leaves the field. Until then the row is only incomplete.
// conflict: the row clashes with another row or with Entra; shown at once.
// decision: Entra already has this person's account; the operator picks whether to use it.
export type RowIssue = {
  field: RowField;
  kind: "input" | "conflict" | "decision";
  summary: string;
  message: string;
  fix?: { label: string; patch: Partial<Omit<AdminRow, "key">> };
};

// A few words for a row's problems: the first that isn't an empty or malformed field, else "Not started" for a row nothing was typed in, else that one field, else how many.
export function issueHeadline(admin: AdminRow, issues: RowIssue[]): string {
  const first = issues.find((issue) => issue.kind !== "input");
  if (first) return first.summary;
  const untouched = ![admin.givenName, admin.surname, admin.mobile, admin.employeeId].some((value) => value.trim()) && admin.displayName === null && admin.username === null;
  if (untouched) return "Not started";
  return issues.length === 1 ? issues[0].summary : `${issues.length} fields missing`;
}

// Every problem with each row, in the order of its fields; a row with none isn't listed. The arguments are adminRowErrors'.
export function adminRowIssues(
  admins: AdminRow[],
  existing: readonly AdminPair[] = [],
  primaryDomain = "",
  takenUpns: ReadonlyMap<string, FoundAccount> = new Map(),
  employeeIdAccounts: ReadonlyMap<string, FoundAccount[]> = new Map()
): Record<string, RowIssue[]> {
  const duplicates = duplicateUpns(admins);
  const employeeIdRows = new Map<string, number>(); // The rows above's employee IDs, by lowercase ID: the first row number with each.
  const issues: Record<string, RowIssue[]> = {};
  for (const [index, admin] of admins.entries()) {
    const resolved = resolveAdmin(admin);
    const found: RowIssue[] = [];
    const add = (issue: RowIssue) => found.push(issue);
    const employeeId = admin.employeeId.trim();
    const domain = admin.domain ?? primaryDomain;
    const upn = `${resolved.username.trim()}@${domain}`.toLowerCase();

    if (!admin.givenName.trim()) add({ field: "givenName", kind: "input", summary: "First name missing", message: "Enter the first name." });
    if (!admin.surname.trim()) add({ field: "surname", kind: "input", summary: "Surname missing", message: "Enter the surname." });
    if (!MOBILE.test(admin.mobile.trim())) add({ field: "mobile", kind: "input", summary: admin.mobile.trim() ? "Mobile number invalid" : "Mobile number missing", message: "Enter a mobile number, e.g. +61 400 000 000." });

    const owner = !!domain && existing.find((pair) => pair.user.employeeId?.trim().toLowerCase() === employeeId.toLowerCase() && pair.user.userPrincipalName.toLowerCase() !== upn);
    const elsewhere = employeeId ? employeeIdElsewhere(admin, primaryDomain, existing, employeeIdAccounts) : null;
    if (!employeeId) add({ field: "employeeId", kind: "input", summary: "Employee ID missing", message: "Enter the employee ID." });
    else if (employeeIdRows.has(employeeId.toLowerCase())) {
      add({ field: "employeeId", kind: "conflict", summary: "Employee ID repeated", message: `Employee ID ${employeeId} is already used by User ${employeeIdRows.get(employeeId.toLowerCase())}. Enter a different Employee ID, or remove this entry if it refers to the same person.` });
    } else if (owner) {
      add({ field: "employeeId", kind: "conflict", summary: "Employee ID in use", message: `Employee ID ${employeeId} is associated with ${owner.user.userPrincipalName}, which already has a Privileged Account. Enter a different Employee ID, or remove this entry if it refers to the same person.` });
    } else if (elsewhere) add(elsewhere);
    if (employeeId && !employeeIdRows.has(employeeId.toLowerCase())) employeeIdRows.set(employeeId.toLowerCase(), index + 1);

    // A display name or UPN that follows the names is missing only while they are, and the names say so.
    if (!resolved.displayName.trim() && admin.displayName !== null) add({ field: "displayName", kind: "input", summary: "Display name missing", message: "Enter a display name." });

    // Asked as soon as Entra has the UPN, like the employee ID's; Use fills in an empty employee ID from Entra, as that one fills in the UPN.
    const duplicate = duplicates[admin.key];
    const reuse = reuseCheck(admin, primaryDomain, takenUpns);
    if (!resolved.username.trim()) {
      if (admin.username !== null) add({ field: "upn", kind: "input", summary: "UPN missing", message: "Enter the UPN." });
    } else if (!USERNAME.test(resolved.username.trim())) add({ field: "upn", kind: "input", summary: "UPN invalid", message: "Use letters, numbers, dots, hyphens or underscores in the UPN." });
    else if (duplicate) add({ field: "upn", kind: "conflict", summary: "UPN repeated", message: `${domain ? `${duplicate.upn}@${domain}` : duplicate.upn} is already used by User ${duplicate.row}. Enter a different UPN.` });
    else if (reuse?.state === "otherPerson") add({ field: "upn", kind: "conflict", summary: "UPN belongs to someone else", message: reuse.message });
    else if (reuse?.state === "unconfirmed") {
      add({ field: "upn", kind: "decision", summary: "UPN already in Entra", message: reuse.message, fix: { label: `Use ${rowUpns(admin, primaryDomain)[0]}`, patch: { confirmedAccountIds: reuse.accountIds, ...(!employeeId && reuse.employeeId ? { employeeId: reuse.employeeId } : {}) } } });
    }

    const pick = admin.manager;
    const loop = managerLoop(admins, admin);
    if (pick?.kind === "row" && !admins.some((other) => other.key === pick.key)) add({ field: "manager", kind: "conflict", summary: "Manager removed", message: "The selected manager was removed from this list. Select another manager." });
    else if (loop) add({ field: "manager", kind: "conflict", summary: "Manager loop", message: `Pick another manager; ${loop}` });

    if (found.length) issues[admin.key] = found;
  }
  return issues;
}

// Accounts Entra has with the row's employee ID under other UPNs, which no listed admin holds: this person's, so the row should use them.
function employeeIdElsewhere(admin: AdminRow, primaryDomain: string, existing: readonly AdminPair[], employeeIdAccounts: ReadonlyMap<string, FoundAccount[]>): RowIssue | null {
  const employeeId = admin.employeeId.trim();
  const own = new Set(rowUpns(admin, primaryDomain).map((upn) => upn.toLowerCase()));
  const listed = new Set(existing.flatMap((pair) => [pair.user.id, pair.privileged.id]));
  const accounts = (employeeIdAccounts.get(employeeId.toLowerCase()) ?? []).filter((account) => !own.has(account.userPrincipalName.toLowerCase()) && !listed.has(account.id));
  if (!accounts.length) return null;
  // The user account's UPN each points at; an adm_ account's is its own without the adm_.
  const userUpns = [...new Set(accounts.map((account) => account.userPrincipalName.replace(/^adm_/i, "")))];
  const associated = `Employee ID ${employeeId} is associated with ${accountNames(accounts)}`;
  const issue: RowIssue = { field: "employeeId", kind: "decision", summary: "Employee ID already in Entra", message: `${associated}, which aren't set up as admins yet.` };
  if (userUpns.length > 1) return issue; // Two people's accounts: the operator picks by changing the UPN.
  const [username, domain] = userUpns[0].split("@");
  const missing = missingAccount(userUpns[0], accounts);
  return {
    ...issue,
    message: missing ? `${associated}, which ${missing}` : `${issue.message} ${NOTHING_CREATED}`,
    fix: { label: `Use ${userUpns[0]}`, patch: { username, domain: domain.toLowerCase() === primaryDomain.toLowerCase() ? null : domain, confirmedAccountIds: accounts.map((account) => account.id) } },
  };
}
