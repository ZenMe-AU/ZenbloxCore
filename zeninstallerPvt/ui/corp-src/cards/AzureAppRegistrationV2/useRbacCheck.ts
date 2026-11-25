/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { getExistingSP, hasRbacRole } from "../../api/azureGraph";
import type { AzureSpTarget } from "../../types";

export type RbacCheckStatus = "unknown" | "sp-not-found" | "missing-role" | "ready";
export type RbacCheckResult = { status: RbacCheckStatus; missingRoles: string[]; checking?: boolean; error?: string | null };

const IDLE: RbacCheckResult = { status: "unknown", missingRoles: [] };

export type UseRbacCheckParams = AzureSpTarget;

export function useRbacCheck({ azureAccount, spClientId, subscriptionId, tenantId }: UseRbacCheckParams): RbacCheckResult {
  const [result, setResult] = useState<RbacCheckResult>(IDLE);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!azureAccount || !spClientId || !subscriptionId) {
        if (!cancelled) {
          setResult(IDLE);
          setChecking(false);
          setError(null);
        }
        return;
      }
      if (!cancelled) {
        setResult(IDLE);
        setChecking(true);
        setError(null);
      }
      try {
        const sp = await getExistingSP(azureAccount, spClientId, tenantId);
        if (cancelled) return;
        if (!sp) {
          setResult({ status: "sp-not-found", missingRoles: [] });
          return;
        }
        const reader = await hasRbacRole(azureAccount, subscriptionId, sp.id, "Reader", tenantId);
        const missingRoles = reader ? [] : ["Reader"];
        if (!cancelled) setResult({ status: missingRoles.length === 0 ? "ready" : "missing-role", missingRoles });
      } catch (failure) {
        if (!cancelled) {
          setResult(IDLE);
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, spClientId, subscriptionId, tenantId]);

  return { ...result, checking, error };
}
