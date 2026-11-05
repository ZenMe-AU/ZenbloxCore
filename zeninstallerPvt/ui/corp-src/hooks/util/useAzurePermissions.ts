/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { getExistingSP, grantAdminConsent, listAppRoleAssignments } from "../../api/azureGraph";
import type { AzureAccount } from "../../types";

export type UseAzurePermissionsParams = {
  azureAccount: AzureAccount | null;
  spClientId: string; // The app registration's client id — its service principal is what the pipeline runs as.
  tenantId?: string;
  permissions?: readonly string[]; // Microsoft Graph application permission ids this caller needs.
};

export type UseAzurePermissions = {
  ready: boolean; // Nothing left to grant: none needed, or the last check found every one assigned.
  missing: readonly string[] | null; // What the last check found missing; null until one has finished.
  error: string | null; // Why the permissions can't be confirmed — not signed in, or a failed check or grant.
  grant: () => Promise<void>;
  granting: boolean;
};

// A stable default, so a caller that needs nothing does not hand `grant` a fresh array each render.
const NONE: readonly string[] = [];

async function findMissing(azureAccount: AzureAccount, spClientId: string, tenantId: string | undefined, permissions: readonly string[]) {
  const sp = await getExistingSP(azureAccount, spClientId, tenantId);
  if (!sp) throw new Error(`Service principal for app ${spClientId} not found — run the Azure card first`);
  const assigned = new Set(await listAppRoleAssignments(azureAccount, sp.id, tenantId));
  return { spId: sp.id, missing: permissions.filter((id) => !assigned.has(id)) };
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Failed to check the pipeline's Graph permissions");

export function useAzurePermissions({ azureAccount, spClientId, tenantId, permissions = NONE }: UseAzurePermissionsParams): UseAzurePermissions {
  const [missing, setMissing] = useState<readonly string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const needed = permissions.length > 0;

  useEffect(() => {
    if (!needed || !azureAccount || !spClientId) return;
    let cancelled = false;
    findMissing(azureAccount, spClientId, tenantId, permissions).then(
      (r) => {
        if (cancelled) return;
        setMissing(r.missing);
        setFailure(null);
      },
      (e) => {
        if (cancelled) return;
        setMissing(null);
        setFailure(messageOf(e));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needed, azureAccount, spClientId, tenantId, permissions]);

  const grant = useCallback(async () => {
    if (!needed || !azureAccount || !spClientId) return;
    setGranting(true);
    setFailure(null);
    try {
      const r = await findMissing(azureAccount, spClientId, tenantId, permissions);
      if (r.missing.length > 0) await grantAdminConsent(azureAccount, r.spId, r.missing, tenantId);
      setMissing([]);
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      setGranting(false);
    }
  }, [needed, azureAccount, spClientId, tenantId, permissions]);

  // Derived rather than stored, so signing out takes effect at once instead of leaving the last result standing.
  const blocker = !azureAccount
    ? "Sign in to Azure so the pipeline's permissions can be checked."
    : !spClientId
      ? "Save AZURE_CLIENT_ID first, so the pipeline's permissions can be checked."
      : null;

  return {
    ready: !needed || (!blocker && missing?.length === 0),
    missing: needed && !blocker ? missing : null,
    error: needed ? (blocker ?? failure) : null,
    grant,
    granting,
  };
}
