/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { ensureResourceGroupCreationAccess } from "../../api/azureArm";
import type { AzureAccount, AzureTarget } from "../../types";

export type ResourceGroupCreationAccess = {
  status: "idle" | "checking" | "ready" | "error";
  error: string | null;
  retry: () => void;
};

export function useResourceGroupCreationAccess({ azureAccount, subscriptionId, tenantId }: AzureTarget): ResourceGroupCreationAccess {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    account: AzureAccount;
    subscriptionId: string;
    tenantId: string | undefined;
    attempt: number;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!azureAccount || !subscriptionId) return;
    let cancelled = false;
    const check = async () => {
      let error: string | null = null;
      try {
        await ensureResourceGroupCreationAccess(azureAccount, subscriptionId, tenantId);
      } catch (err) {
        error = (err instanceof Error ? err.message : String(err)) || "Could not verify subscription access. Recheck subscription access before creating resources.";
      }
      if (!cancelled) setResult({ account: azureAccount, subscriptionId, tenantId, attempt, error });
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId, attempt]);

  const current =
    result?.account === azureAccount && result?.subscriptionId === subscriptionId && result?.tenantId === tenantId && result?.attempt === attempt;
  const error = current ? result.error : null;
  const status = !azureAccount || !subscriptionId ? "idle" : !current ? "checking" : error ? "error" : "ready";
  return { status, error, retry: () => setAttempt((previous) => previous + 1) };
}
