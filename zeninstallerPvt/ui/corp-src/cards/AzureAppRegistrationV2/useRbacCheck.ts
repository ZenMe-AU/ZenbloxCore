/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getExistingSP, hasRbacRole } from "../../api/azureGraph";
import type { AzureSpTarget } from "../../types";

export type RbacCheckStatus = "unknown" | "sp-not-found" | "missing-role" | "ready";
export type RbacCheckResult = { status: RbacCheckStatus; missingRoles: string[]; checking?: boolean; error?: string | null };

const IDLE: RbacCheckResult = { status: "unknown", missingRoles: [] };

export type UseRbacCheckParams = AzureSpTarget;

function rbacKey({ azureAccount, spClientId, subscriptionId, tenantId }: UseRbacCheckParams) {
  return ["azure_app_registration_v2", "rbac", azureAccount?.homeAccountId, azureAccount?.tenantId, tenantId, subscriptionId, spClientId] as const;
}

export function useRbacCheck(target: UseRbacCheckParams) {
  const { azureAccount, spClientId, subscriptionId, tenantId } = target;
  const enabled = !!azureAccount && !!spClientId && !!subscriptionId;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: rbacKey(target),
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }): Promise<RbacCheckResult> => {
      const sp = await getExistingSP(azureAccount!, spClientId, tenantId, signal);
      signal.throwIfAborted();
      if (!sp) return { status: "sp-not-found", missingRoles: [] };

      const reader = await hasRbacRole(azureAccount!, subscriptionId, sp.id, "Reader", tenantId);
      return reader ? { status: "ready", missingRoles: [] } : { status: "missing-role", missingRoles: ["Reader"] };
    },
  });

  return {
    ...(query.isError ? IDLE : query.data ?? IDLE),
    checking: query.isFetching,
    recheck: () => { if (enabled) void query.refetch(); },
    markReady: async (clientId: string) => {
      const key = rbacKey({ ...target, spClientId: clientId });
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<RbacCheckResult>(key, { status: "ready", missingRoles: [] });
    },
    error: query.error ? query.error.message : null,
  };
}
