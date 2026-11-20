/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { formatAzureAccessError, getProviderRegistrationState, listUnregisteredProviders, registerProvider } from "../../api/azureArm";
import type { AzureAccount } from "../../types";

const POLL_START_MS = 2000;
const POLL_MAX_MS = 15_000;
const POLL_FACTOR = 1.5;
const TIMEOUT_MS = 180_000;

export type UseProviderRegistrationParams = {
  azureAccount: AzureAccount | null;
  subscriptionId: string;
  tenantId?: string;
};

export function useProviderRegistration({ azureAccount, subscriptionId, tenantId }: UseProviderRegistrationParams) {
  // Resolves to the namespaces this call actually had to register; already-registered ones are omitted.
  const ensureRegistered = useCallback(
    async (namespaces: readonly string[]): Promise<{ registered: string[] }> => {
      if (!azureAccount || !subscriptionId || namespaces.length === 0) return { registered: [] };

      const registerOne = async (namespace: string): Promise<boolean> => {
        if ((await getProviderRegistrationState(azureAccount, subscriptionId, namespace, tenantId)) === "Registered") {
          return false;
        }
        await registerProvider(azureAccount, subscriptionId, namespace, tenantId);

        const start = Date.now();
        let delay = POLL_START_MS;
        for (;;) {
          await new Promise((r) => setTimeout(r, delay));
          if ((await getProviderRegistrationState(azureAccount, subscriptionId, namespace, tenantId)) === "Registered") {
            return true;
          }
          if (Date.now() - start > TIMEOUT_MS) throw new Error(`Timed out registering resource provider ${namespace}`);
          delay = Math.min(delay * POLL_FACTOR, POLL_MAX_MS);
        }
      };

      // Parallel: namespaces register independently, so one slow provider shouldn't serialise the rest.
      const results = await Promise.all(namespaces.map(async (ns) => ({ ns, registered: await registerOne(ns) })));
      return { registered: results.filter((r) => r.registered).map((r) => r.ns) };
    },
    [azureAccount, subscriptionId, tenantId]
  );

  return { ensureRegistered };
}

// Which of these aren't registered yet, and a click that registers them; idle until there is an account and subscription.
export function useUnregisteredProviders(target: UseProviderRegistrationParams, namespaces: readonly string[]) {
  const { azureAccount, subscriptionId, tenantId } = target;
  const { ensureRegistered } = useProviderRegistration(target);
  const [attempt, setAttempt] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState<{ key: string; unregistered: string[]; error: string | null } | null>(null);
  const list = namespaces.join(",");
  const key = `${azureAccount?.homeAccountId}|${subscriptionId}|${tenantId}|${list}|${attempt}`;

  useEffect(() => {
    if (!azureAccount || !subscriptionId || !list) return;
    let cancelled = false;
    listUnregisteredProviders(azureAccount, subscriptionId, list.split(","), tenantId).then(
      (unregistered) => { if (!cancelled) setResult({ key, unregistered, error: null }); },
      (error: unknown) => { if (!cancelled) setResult({ key, unregistered: [], error: formatAzureAccessError(error) }); }
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId, list, key]);

  const current = result?.key === key ? result : null;
  const register = async () => {
    if (!current?.unregistered.length) return;
    setRegistering(true);
    try {
      await ensureRegistered(current.unregistered);
      setAttempt((n) => n + 1);
    } catch (error) {
      setResult({ ...current, error: formatAzureAccessError(error) });
    } finally {
      setRegistering(false);
    }
  };
  const status = !azureAccount || !subscriptionId ? "idle" as const
    : !list ? "ready" as const
    : !current ? "checking" as const
    : current.error ? "error" as const
    : current.unregistered.length ? "unregistered" as const : "ready" as const;
  return { status, unregistered: current?.unregistered ?? [], error: current?.error ?? null, registering, register, retry: () => setAttempt((n) => n + 1) };
}

export type UnregisteredProviders = ReturnType<typeof useUnregisteredProviders>;
