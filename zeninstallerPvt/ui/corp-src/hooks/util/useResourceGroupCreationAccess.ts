/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { ensureResourceGroupCreationAccess } from "../../api/azureArm";
import type { AzureAccount, AzureTarget } from "../../types";

export type SubscriptionAccess = {
  status: "idle" | "checking" | "ready" | "error";
  error: string | null;
  retry: () => void;
};

export type ResourceGroupCreationAccess = SubscriptionAccess;

export function useSubscriptionAccess(
  { azureAccount, subscriptionId, tenantId }: AzureTarget,
  checkAccess: typeof ensureResourceGroupCreationAccess
): SubscriptionAccess {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    account: AzureAccount;
    subscriptionId: string;
    tenantId: string | undefined;
    checkAccess: typeof checkAccess;
    attempt: number;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!azureAccount || !subscriptionId) return;
    let cancelled = false;
    const check = async () => {
      let error: string | null = null;
      try {
        await checkAccess(azureAccount, subscriptionId, tenantId);
      } catch (err) {
        error = (err instanceof Error ? err.message : String(err)) || "Could not verify subscription access. Recheck subscription access before creating resources.";
      }
      if (!cancelled) setResult({ account: azureAccount, subscriptionId, tenantId, checkAccess, attempt, error });
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId, attempt, checkAccess]);

  const current =
    result?.account === azureAccount && result?.subscriptionId === subscriptionId && result?.tenantId === tenantId &&
    result?.checkAccess === checkAccess && result?.attempt === attempt;
  const error = current ? result.error : null;
  const status = !azureAccount || !subscriptionId ? "idle" : !current ? "checking" : error ? "error" : "ready";
  return { status, error, retry: () => setAttempt((previous) => previous + 1) };
}

export function useResourceGroupCreationAccess(target: AzureTarget): ResourceGroupCreationAccess {
  return useSubscriptionAccess(target, ensureResourceGroupCreationAccess);
}
