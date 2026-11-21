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
  listVerifiedDomainsViaOrganization,
  type AdminPair,
  type EntraUser,
  type VerifiedDomain,
} from "../../api/azureGraph";
import type { AzureAccount } from "../../types";
import { ADMIN_GROUPS, PRIVILEGED_ACCOUNT_GROUPS, USER_ACCOUNT_GROUPS, type LicenceState } from "./config";
import { errorText } from "./logic";

// The groups still missing, the admins already in Entra, and the signed-in user. Read again when checkKey changes.
export function useAdminDirectory(azureAccount: AzureAccount | null, tenantId: string | null, checkKey: number) {
  const [missingGroups, setMissingGroups] = useState<string[] | null>(null);
  const [existingAdmins, setExistingAdmins] = useState<AdminPair[] | null>(null);
  const [signedInUser, setSignedInUser] = useState<EntraUser | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      },
      (err) => {
        if (!cancelled) setError(errorText(err));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, tenantId, tid, checkKey]);

  return { missingGroups, existingAdmins, signedInUser, error };
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

// The UPNs Entra already has, lowercase; looked up once typing stops.
export function useTakenUpns(azureAccount: AzureAccount | null, tenantId: string | null, upns: string[]): Set<string> {
  const [takenUpns, setTakenUpns] = useState<Set<string>>(new Set());
  const tid = tenantId || undefined;
  const list = [...new Set(upns)].join(" "); // A string, so the effect reruns only when the UPNs change.

  useEffect(() => {
    if (!azureAccount || !list) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const names = list.split(" ");
      void Promise.all(names.map((upn) => getUserByUpn(azureAccount, upn, tid).then((u) => !!u, () => false))).then((found) => {
        if (!cancelled) setTakenUpns(new Set(names.filter((_, i) => found[i]).map((upn) => upn.toLowerCase())));
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [azureAccount, tid, list]);

  return takenUpns;
}
