/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { fetchStageReport } from "../../api";
import { useRemoteTerminal, type UseRemoteTerminal } from "../../cards/Stage/useRemoteTerminal";
import type { Account, CardHook, CardStatus, GhEnv, Stage, StageReport } from "../../types";

export type PrivAvdTarget = {
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
};

// No plan step: the user signs in through the terminal and the workflow runs the stage's script as them.
const DEPLOY_WORKFLOW = "deployPrivAvd.yml";

// The golden-image build alone runs for over an hour, so the result is checked for up to three.
const POLL_MS = 60_000;
const MAX_POLLS = 180;

// The deploy state every PrivAVD card shares; each card adds its own cardId, requirements and label.
export interface PrivAvdDeploy extends Pick<CardHook, "done" | "status" | "summary"> {
  report: Stage | null;
  deploying: boolean;
  error: string | null;
  terminal: UseRemoteTerminal;
  deploy: () => Promise<void>;
}

export function usePrivAvdDeploy({ dir, account, repoName, selectedEnv }: PrivAvdTarget & { dir: string }): PrivAvdDeploy {
  const [report, setReport] = useState<StageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminal = useRemoteTerminal({ account, repoName, workflowId: DEPLOY_WORKFLOW, dir, planRunId: undefined, selectedEnv });
  const startTerminal = terminal.start;

  const envName = selectedEnv?.name;
  const readReport = useCallback(
    async () => (account && repoName && envName ? fetchStageReport(account, repoName, envName, dir, "deploy") : null),
    [account, repoName, envName, dir]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await readReport();
        if (!cancelled) setReport(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not read the last deploy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readReport]);

  // The terminal only carries the sign-in; the script runs after it, so its result is read back off the Deployments API.
  const deploy = useCallback(async () => {
    const before = Date.now();
    setDeploying(true);
    setError(null);
    try {
      if (!(await startTerminal())) return;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const next = await readReport();
        if (next && next.createdAt > before) {
          setReport(next);
          return;
        }
      }
      setError("The deploy is taking longer than expected — check GitHub Actions.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the deploy result");
    } finally {
      setDeploying(false);
    }
  }, [startTerminal, readReport]);

  const deployStatus = report?.stage.deployStatus;
  const done = deployStatus === "success";
  const status: CardStatus =
    loading || deploying ? "loading" : done ? "complete" : deployStatus === "failed" ? "error" : deployStatus === "cancelled" ? "warning" : "idle";
  const summary = deploying
    ? "Deploying..."
    : loading
      ? "Loading status..."
      : done
        ? "Deployed"
        : deployStatus === "failed"
          ? "Last deploy failed"
          : deployStatus === "cancelled"
            ? "Last deploy cancelled"
            : "Not deployed";

  return {
    done,
    status,
    summary,
    report: report?.stage ?? null,
    deploying,
    error,
    terminal,
    deploy,
  };
}
