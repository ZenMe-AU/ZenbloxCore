/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { useProvisioning, type UseProvisioning } from "../hooks/util/useProvisioning";
import type { PlanState, ProvisionModule } from "../logic/provisioning";
import type { SetupStep } from "../types";

export function createHookHarness<T>(hook: () => T, onUpdate: (value: T) => void) {
  function Harness() {
    const value = hook();
    useEffect(() => {
      onUpdate(value);
    }, [value]);
    return null;
  }

  const container = document.createElement("div");
  const root = createRoot(container);

  return { root, container, Harness };
}

export async function waitFor(assertion: () => void, timeoutMs = 1500) {
  const start = Date.now();
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
}

// Runs one part's tasks the way its card does, with the step rows the part tests read.
export function usePartRun<T extends { provisioning: ProvisionModule }>(part: T) {
  const runner = useProvisioning([part.provisioning]);
  const steps = runner.started ? toSetupSteps(part.provisioning, runner.state, runner.plan) : [];
  return { ...part, run: () => runner.run(true), running: runner.running, steps };
}

export type PartRun<T> = T & { run: () => Promise<boolean>; running: boolean; steps: SetupStep[] };

// One module's tasks as checklist rows.
function toSetupSteps(module: ProvisionModule, state: PlanState, plan: UseProvisioning["plan"]): SetupStep[] {
  const stage = plan.stages.find((candidate) => candidate.id === module.id);
  if (!stage) return [];
  return stage.steps.map((step) => {
    const task = state[step.taskId];
    const status: SetupStep["status"] =
      task?.status === "completed" ? "done"
        : task?.status === "skipped" ? "skipped"
          : task?.status === "running" || task?.status === "retrying" ? "running"
            : task?.status === "failed" || task?.status === "action_required" ? "error"
              : "pending";
    // Blocked rows read as pending, as they did before; their reason is in the deployment details.
    return { id: step.key, label: step.label, status, detail: status === "pending" ? undefined : task?.detail };
  });
}
