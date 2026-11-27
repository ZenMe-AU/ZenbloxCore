/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildPlan,
  createRetryChannel,
  initialState,
  isSettled,
  planProgress,
  runPlan,
  type PlanState,
  type ProvisionModule,
  type RetryChannel,
} from "../../logic/provisioning";

export function useProvisioning(modules: readonly ProvisionModule[]) {
  // A few dozen tasks, so it is rebuilt every render; a run reads the latest through planRef.
  const plan = buildPlan(modules);
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const [stored, setStored] = useState<PlanState>({});
  const storedRef = useRef<PlanState>({});
  const channelRef = useRef<RetryChannel | null>(null);
  const [running, setRunning] = useState(false);
  const state = initialState(plan, stored);
  const started = Object.keys(stored).length > 0;

  const update = useCallback((next: PlanState) => {
    storedRef.current = next;
    setStored(next);
  }, []);

  // fresh: verify everything again (a Re-run); otherwise keep what settled and run the rest.
  const start = useCallback(async (options: { fresh?: boolean; retry?: readonly string[] } = {}): Promise<boolean> => {
    if (channelRef.current) {
      // Already running: a retry joins the run, a second Create does nothing.
      if (options.retry) channelRef.current.push(options.retry);
      return false;
    }
    const channel = createRetryChannel();
    channelRef.current = channel;
    setRunning(true);
    try {
      let final = await runPlan(() => planRef.current, options.fresh ? {} : storedRef.current, { retry: options.retry, retries: channel, onUpdate: update });
      // A retry that arrived as the last task finished.
      for (let late = channel.take(); late.length; late = channel.take()) {
        final = await runPlan(() => planRef.current, final, { retry: late, retries: channel, onUpdate: update });
      }
      return [...planRef.current.tasks.keys()].every((id) => isSettled(final[id]?.status));
    } finally {
      channelRef.current = null;
      setRunning(false);
    }
  }, [update]);

  const run = useCallback((fresh = false) => start({ fresh }), [start]);
  const retry = useCallback((taskIds: readonly string[]) => start({ retry: taskIds }), [start]);
  const reset = useCallback(() => update({}), [update]);

  return { plan, state, started, running, progress: planProgress(plan, state), run, retry, reset };
}

export type UseProvisioning = ReturnType<typeof useProvisioning>;

