/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// The card's reads from Entra. Each keeps the raw error; the card hook decides whether it's missing consent.

import { useEffect, useState } from "react";
import {
  getEntraLicence,
  getGroupByName,
  getSignedInUser,
  getUserByUpn,
  listAdminPairs,
  listUsersByEmployeeId,
  listVerifiedDomainsViaOrganization,
  type AdminPair,
  type EntraUser,
  type VerifiedDomain,
} from "../../api/azureGraph";
import type { AzureAccount } from "../../types";
import { ADMIN_GROUPS, PRIVILEGED_ACCOUNT_GROUPS, USER_ACCOUNT_GROUPS, type LicenceState } from "./config";
import { errorText, type FoundAccount } from "./logic";

// The groups still missing, the admins already in Entra, and the signed-in user. Read again when checkKey changes; checking until that read is back.
export function useAdminDirectory(azureAccount: AzureAccount | null, tenantId: string | null, checkKey: number) {
  const [missingGroups, setMissingGroups] = useState<string[] | null>(null);
  const [existingAdmins, setExistingAdmins] = useState<AdminPair[] | null>(null);
  const [signedInUser, setSignedInUser] = useState<EntraUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readKey, setReadKey] = useState<number | null>(null); // The checkKey of the last read that came back.
  const tid = tenantId || undefined;

  // The card is done once every group exists; the admins it already made are listed too.
  useEffect(() => {
    if (!azureAccount || !tenantId) return;
    let cancelled = false;
    Promise.all([Promise.all(ADMIN_GROUPS.map((g) => getGroupByName(azureAccount, g.name, tid))), listAdminPairs(azureAccount, { user: USER_ACCOUNT_GROUPS, privileged: PRIVILEGED_ACCOUNT_GROUPS }, tid), getSignedInUser(azureAccount, tid)]).then(
      ([found, pairs, me]) => {
        if (cancelled) return;
        setMissingGroups(ADMIN_GROUPS.filter((_, i) => !found[i]).map((g) => g.name));
        setExistingAdmins(pairs);
        setSignedInUser(me);
        setError(null);
        setReadKey(checkKey);
      },
      (err) => {
        if (cancelled) return;
        setError(errorText(err));
        setReadKey(checkKey);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, tenantId, tid, checkKey]);

  return { missingGroups, existingAdmins, signedInUser, checking: readKey !== checkKey, error };
}

// The licence, which selects the role-assignment mode and PIM, and the verified domains; both need the same permission.
export function useLicenceAndDomains(azureAccount: AzureAccount | null, tenantId: string | null) {
  const [entraLicence, setEntraLicence] = useState<LicenceState>(null);
  const [domains, setDomains] = useState<VerifiedDomain[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tid = tenantId || undefined;

  useEffect(() => {
    if (!azureAccount || !tenantId) return;
    let cancelled = false;
    Promise.all([getEntraLicence(azureAccount, tid), listVerifiedDomainsViaOrganization(azureAccount, tid)]).then(
      ([licence, verified]) => {
        if (cancelled) return;
        setEntraLicence(licence);
        setDomains(verified);
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        setError(errorText(err));
        setEntraLicence("unknown");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, tenantId, tid]);

  return { entraLicence, domains, error };
}

// The accounts Entra already has under these UPNs, by lowercase UPN; looked up once typing stops, and again when checkKey changes.
// A lookup that fails counts as not taken; the run looks again before it reuses anything.
export function useTakenUpns(azureAccount: AzureAccount | null, tenantId: string | null, upns: string[], checkKey: number): Map<string, FoundAccount> {
  const [takenUpns, setTakenUpns] = useState<Map<string, FoundAccount>>(new Map());
  const tid = tenantId || undefined;
  const list = [...new Set(upns)].join(" "); // A string, so the effect reruns only when the UPNs change.

  useEffect(() => {
    if (!azureAccount || !list) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const names = list.split(" ");
      void Promise.all(names.map((upn) => getUserByUpn(azureAccount, upn, tid).catch(() => null))).then((found) => {
        if (!cancelled) setTakenUpns(new Map(names.flatMap((upn, index) => (found[index] ? [[upn.toLowerCase(), found[index]] as const] : []))));
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [azureAccount, tid, list, checkKey]);

  return takenUpns;
}

// The accounts Entra already has with these employee IDs, by lowercase ID; looked up like useTakenUpns.
export function useEmployeeIdAccounts(azureAccount: AzureAccount | null, tenantId: string | null, employeeIds: string[], checkKey: number): Map<string, FoundAccount[]> {
  const [accounts, setAccounts] = useState<Map<string, FoundAccount[]>>(new Map());
  const tid = tenantId || undefined;
  const list = [...new Set(employeeIds.map((employeeId) => employeeId.trim()).filter(Boolean))].join("\n"); // A string, so the effect reruns only when the IDs change.

  useEffect(() => {
    if (!azureAccount || !list) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const ids = list.split("\n");
      void Promise.all(ids.map((employeeId) => listUsersByEmployeeId(azureAccount, employeeId, tid).catch(() => []))).then((found) => {
        if (!cancelled) setAccounts(new Map(ids.map((employeeId, index) => [employeeId.toLowerCase(), found[index]])));
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [azureAccount, tid, list, checkKey]);

  return accounts;
}
