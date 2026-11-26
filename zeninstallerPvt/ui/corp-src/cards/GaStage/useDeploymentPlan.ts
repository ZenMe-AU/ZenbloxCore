/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStageReport as fetchGaResult, getPlanEnv, triggerWorkflow } from "./api";
import type { Account, Branch, GaResult, GhEnv, PlanSummary, Stage } from "./types";
import type { GaStageDefinition, GaStageKey } from "./stageDefinitions";

interface PollContext {
  attempt: number;
  triggerTime: number;
  stageKey: GaStageKey;
  kind: "plan" | "deploy";
  generation: number;
}

type OperationKind = "plan" | "deploy";
type StartDeployment = (isCurrent: () => boolean) => Promise<boolean>;
export type StageRun =
  | { state: "active"; kind: OperationKind; countdown: number; retryCount: number }
  | { state: "error"; kind: OperationKind; error: string };
export type StageOperation = StageRun | { state: "idle" };

export interface UseDeploymentPlan {
  latestSha?: string;
  stages: Stage[];
  stageSummaries: Record<string, PlanSummary>;
  hasPlan: boolean;
  stagesLoading: boolean;
  runs: Partial<Record<GaStageKey, StageRun>>;
  deployedEnv: Record<string, string> | null;
  // Both take just the stage key: the hook already holds the definitions, selected
  // env and the branches, so handing them back in would be a second source for the same value.
  onRun: (stageKey: GaStageKey) => Promise<void>; // One card, one stage — never the whole pipeline.
  deployStage: (stageKey: GaStageKey, start: StartDeployment) => Promise<void>;
  forcePlan: (stageKey: GaStageKey) => Promise<void>;
  forceDeploy: (stageKey: GaStageKey, start: StartDeployment) => Promise<void>;
  forceIdle: (stageKey: GaStageKey) => void;
  forceError: (stageKey: GaStageKey, kind: OperationKind) => void;
  setStageSummary: (key: GaStageKey, summary: PlanSummary) => void;
}

const POLL_DELAYS = [150, 180, 200, 300];

type GaResults = Map<GaStageKey, { plan: GaResult | null; deploy: GaResult | null }>;

async function readGaResults(
  account: Account,
  repoName: string,
  envName: string,
  stageDefinitions: readonly GaStageDefinition[],
): Promise<GaResults> {
  const readResult = (stageKey: GaStageKey, kind: "plan" | "deploy") =>
    fetchGaResult(account, repoName, envName, stageKey, kind).catch((error) => {
      console.error(`Failed to fetch the ${kind} result for "${stageKey}":`, error);
      return null;
    });
  const entries = await Promise.all(stageDefinitions.map(async ({ dir }) => {
    const [plan, deploy] = await Promise.all([readResult(dir, "plan"), readResult(dir, "deploy")]);
    return [dir, { plan, deploy }] as const;
  }));
  return new Map(entries);
}

function mergeGaResults(stageDefinitions: readonly GaStageDefinition[], results: GaResults): Stage[] {
  return stageDefinitions.map(({ dir }) => {
    const { plan, deploy } = results.get(dir) ?? { plan: null, deploy: null };
    if (!plan && !deploy) return { stage: dir, status: "pending" as const };
    return { ...plan?.stage, ...deploy?.stage, stage: dir, planSha: plan?.sha } as Stage;
  });
}

function reportedEnvironmentId(results: GaResults): number | null {
  const newestPlan = [...results.values()]
    .map(({ plan }) => plan)
    .filter((result): result is GaResult => !!result)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  return typeof newestPlan?.stage.envId === "number" ? newestPlan.stage.envId : null;
}

function gaResultKey(stage: Stage): string {
  return `${stage.runId ?? ""}|${stage.planJsonId ?? ""}|${stage.planSha ?? ""}`;
}

export function useDeploymentPlan(opts: {
  account: Account | null;
  repoName: string | null;
  stageDefinitions: readonly GaStageDefinition[];
  selectedEnv: GhEnv | null;
  branches: Branch[];
  branchMatchError: string | null;
  envReady: boolean;
}): UseDeploymentPlan {
  const accountRef = useRef(opts.account);
  const repoNameRef = useRef(opts.repoName);
  const stageDefinitionsRef = useRef(opts.stageDefinitions);
  const selectedEnvRef = useRef(opts.selectedEnv);
  const branchesRef = useRef(opts.branches);
  const envReadyRef = useRef(opts.envReady);
  useLayoutEffect(() => {
    accountRef.current = opts.account;
    repoNameRef.current = opts.repoName;
    stageDefinitionsRef.current = opts.stageDefinitions;
    selectedEnvRef.current = opts.selectedEnv;
    branchesRef.current = opts.branches;
    envReadyRef.current = opts.envReady;
  });

  const queryClient = useQueryClient();
  const matchedBranchName = opts.branches.find(
    (branch) => branch.name.toLowerCase() === opts.selectedEnv?.name.toLowerCase(),
  )?.name;
  const canReadResults = !!opts.account && !!opts.repoName && !!opts.selectedEnv && !!matchedBranchName && !opts.branchMatchError;
  const gaResultsQueryKey = [
    "ga-stage", "results", opts.account?.login, opts.repoName, opts.selectedEnv?.name,
    opts.stageDefinitions.map(({ dir }) => dir),
  ];
  const resultsQuery = useQuery({
    queryKey: gaResultsQueryKey,
    enabled: canReadResults,
    queryFn: () => readGaResults(opts.account!, opts.repoName!, opts.selectedEnv!.name, opts.stageDefinitions),
  });
  const results = useMemo(() => resultsQuery.data ?? new Map<GaStageKey, { plan: GaResult | null; deploy: GaResult | null }>(), [resultsQuery.data]);
  const stages = useMemo(() => mergeGaResults(opts.stageDefinitions, results), [opts.stageDefinitions, results]);
  const stagesRef = useRef<Stage[]>(stages);
  useLayoutEffect(() => {
    stagesRef.current = stages;
  });
  const hasPlan = resultsQuery.isPending ? true : [...results.values()].some(({ plan, deploy }) => !!plan || !!deploy);
  const stagesLoading = canReadResults && resultsQuery.isPending;

  const environmentId = reportedEnvironmentId(results);
  const deployedEnvironmentQuery = useQuery({
    queryKey: ["ga-stage", "deployed-environment", opts.account?.login, opts.repoName, environmentId],
    enabled: !!opts.account && !!opts.repoName && !!environmentId,
    staleTime: Infinity,
    retry: false,
    queryFn: () => getPlanEnv(opts.account!, opts.repoName!, environmentId!),
  });
  const deployedEnv = deployedEnvironmentQuery.data ?? null;

  const [summaryEntries, setSummaryEntries] = useState<Partial<Record<GaStageKey, { resultKey: string; summary: PlanSummary }>>>({});
  const stageSummaries = useMemo(() => Object.fromEntries(stages.flatMap((stage) => {
    const entry = summaryEntries[stage.stage as GaStageKey];
    return entry && entry.resultKey === gaResultKey(stage) ? [[stage.stage, entry.summary]] : [];
  })), [stages, summaryEntries]);
  const environmentKey = opts.selectedEnv?.id ?? null;
  const [runState, setRunState] = useState<{
    environmentKey: number | null;
    runs: Partial<Record<GaStageKey, StageRun>>;
  }>({ environmentKey, runs: {} });
  const runs = runState.environmentKey === environmentKey ? runState.runs : {};
  const setRuns = (updateRuns: (previous: Partial<Record<GaStageKey, StageRun>>) => Partial<Record<GaStageKey, StageRun>>) => {
    setRunState((previous) => ({
      environmentKey,
      runs: updateRuns(previous.environmentKey === environmentKey ? previous.runs : {}),
    }));
  };
  // One interval per stage, so a second card starting a run cannot cancel the first one's.
  const tickers = useRef<Partial<Record<GaStageKey, ReturnType<typeof setInterval>>>>({});
  const generations = useRef<Partial<Record<GaStageKey, number>>>({});
  const operationNames = useRef<Partial<Record<GaStageKey, string>>>({});
  const trace = (stageKey: GaStageKey, event: string, generation: number) =>
    console.info(`[GaStage ${stageKey}] ${event} (operation ${generation})`);
  const stateName = (state: StageOperation) => state.state === "idle" ? "idle" : `${state.kind} ${state.state}`;

  const stopTicker = (stageKey: GaStageKey) => {
    clearInterval(tickers.current[stageKey]);
    delete tickers.current[stageKey];
  };
  const begin = (stageKey: GaStageKey, state: StageOperation, reason: string) => {
    stopTicker(stageKey);
    const generation = (generations.current[stageKey] ?? 0) + 1;
    generations.current[stageKey] = generation;
    const next = stateName(state);
    trace(stageKey, `${operationNames.current[stageKey] ?? "idle"} -> ${next} (${reason})`, generation);
    operationNames.current[stageKey] = next;
    setRuns((previous) => {
      const next = { ...previous };
      if (state.state === "idle") delete next[stageKey];
      else next[stageKey] = state;
      return next;
    });
    return generation;
  };
  const update = (stageKey: GaStageKey, generation: number, state: StageOperation) => {
    if (generations.current[stageKey] !== generation) {
      trace(stageKey, "ignored stale operation update", generation);
      return;
    }
    const next = stateName(state);
    if (operationNames.current[stageKey] !== next) {
      trace(stageKey, `${operationNames.current[stageKey] ?? "idle"} -> ${next}`, generation);
      operationNames.current[stageKey] = next;
    }
    setRuns((previous) => {
      const next = { ...previous };
      if (state.state === "idle") delete next[stageKey];
      else next[stageKey] = state;
      return next;
    });
  };
  const fail = (stageKey: GaStageKey, generation: number, kind: OperationKind, error: string) => {
    console.error(`[GaStage ${stageKey}] ${error}`);
    update(stageKey, generation, { state: "error", kind, error });
  };
  useEffect(() => () => {
    stageDefinitionsRef.current.forEach(({ dir }) => {
      stopTicker(dir);
      generations.current[dir] = (generations.current[dir] ?? 0) + 1;
      if (operationNames.current[dir] && operationNames.current[dir] !== "idle") {
        trace(dir, `${operationNames.current[dir]} -> idle (unmounted; stopped tracking)`, generations.current[dir]);
      }
      delete operationNames.current[dir];
    });
  }, []);
  const implRef = useRef<{
    readResultsForPoll: (ref: string, poll: PollContext) => void;
    startPollingImpl: (ref: string, attempt: number, triggerTime: number, stageKey: GaStageKey, kind: OperationKind, generation: number) => void;
  }>({ readResultsForPoll: () => {}, startPollingImpl: () => {} });

  const startPollingImpl = (ref: string, attempt: number, triggerTime: number, stageKey: GaStageKey, kind: OperationKind, generation: number) => {
    if (generations.current[stageKey] !== generation) return;
    const delay = POLL_DELAYS[attempt] ?? POLL_DELAYS[POLL_DELAYS.length - 1];
    trace(stageKey, `${kind} result poll ${attempt + 1} scheduled in ${delay}s`, generation);
    stopTicker(stageKey);
    update(stageKey, generation, { state: "active", kind, countdown: delay, retryCount: attempt });
    const deadline = Date.now() + delay * 1000;
    tickers.current[stageKey] = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      update(stageKey, generation, { state: "active", kind, countdown: remaining, retryCount: attempt });
      if (remaining <= 0) {
        stopTicker(stageKey);
        implRef.current.readResultsForPoll(ref, { attempt, triggerTime, stageKey, kind, generation });
      }
    }, 1000);
  };

  const readResultsForPoll = (ref: string, poll: PollContext) => {
    const account = accountRef.current;
    const repoName = repoNameRef.current;
    const envName = selectedEnvRef.current?.name;
    const definitions = stageDefinitionsRef.current;
    if (!account || !repoName || !envName) return;

    void readGaResults(account, repoName, envName, definitions).then((byKey) => {
      if (generations.current[poll.stageKey] !== poll.generation) {
        trace(poll.stageKey, "ignored stale result response", poll.generation);
        return;
      }
      queryClient.setQueryData(gaResultsQueryKey, byKey);
      const reported = byKey.get(poll.stageKey)?.[poll.kind]?.createdAt ?? 0;
      if (reported <= poll.triggerTime) {
        const next = poll.attempt + 1;
        if (next >= POLL_DELAYS.length) {
          fail(poll.stageKey, poll.generation, poll.kind, "Workflow is taking too long. Please check GitHub Actions.");
        } else {
          implRef.current.startPollingImpl(ref, next, poll.triggerTime, poll.stageKey, poll.kind, poll.generation);
        }
        return;
      }
      trace(poll.stageKey, `${poll.kind} result received; polling complete`, poll.generation);
      update(poll.stageKey, poll.generation, { state: "idle" });
    }).catch((error) => {
      if (generations.current[poll.stageKey] !== poll.generation) {
        trace(poll.stageKey, "ignored stale result failure", poll.generation);
        return;
      }
      console.error("Failed to load the GitHub Actions results:", error);
      fail(poll.stageKey, poll.generation, poll.kind, "Could not read the GitHub Actions results");
    });
  };

  useLayoutEffect(() => {
    implRef.current.readResultsForPoll = readResultsForPoll;
    implRef.current.startPollingImpl = startPollingImpl;
  });

  useEffect(() => {
    stageDefinitionsRef.current.forEach(({ dir }) => {
      stopTicker(dir);
      generations.current[dir] = (generations.current[dir] ?? 0) + 1;
      if (operationNames.current[dir] && operationNames.current[dir] !== "idle") {
        trace(dir, `${operationNames.current[dir]} -> idle (environment changed; stopped tracking)`, generations.current[dir]);
      }
      delete operationNames.current[dir];
    });
  }, [opts.selectedEnv?.id]);

  const runPlan = async (stageKey: GaStageKey, forced: boolean) => {
    const acc = accountRef.current;
    const repo = repoNameRef.current;
    const env = selectedEnvRef.current;
    const stage = stageDefinitionsRef.current.find((s) => s.dir === stageKey);
    if (!forced && (!acc || !repo || !envReadyRef.current || !env || !stage)) return;
    const generation = begin(stageKey, { state: "active", kind: "plan", countdown: 0, retryCount: 0 }, forced ? "forced" : "plan requested");
    if (!acc || !repo || !env || !stage?.workflowId) {
      fail(stageKey, generation, "plan", "Cannot start plan: account, repository, environment, and workflow are required.");
      return;
    }
    // Starting a new plan invalidates any summary computed from the previous report.
    setSummaryEntries((previous) => {
      const next = { ...previous };
      delete next[stageKey];
      return next;
    });
    const triggerTime = Date.now();
    try {
      await triggerWorkflow(acc, repo, stage.workflowId, env.name, env.name, stage.dir);
    } catch (e) {
      console.error("Failed to trigger workflow:", e);
      fail(stageKey, generation, "plan", "Failed to trigger workflow");
      return;
    }
    if (generations.current[stageKey] !== generation) {
      trace(stageKey, "ignored stale plan dispatch result", generation);
      return;
    }
    trace(stageKey, "plan workflow dispatched", generation);

    const matchedBranch = branchesRef.current.find((b) => b.name.toLowerCase() === env.name.toLowerCase());
    if (!matchedBranch) {
      fail(stageKey, generation, "plan", `No branch found matching env "${env.name}"`);
      return;
    }
    implRef.current.startPollingImpl(matchedBranch.name, 0, triggerTime, stageKey, "plan", generation);
  };
  const onRun = (stageKey: GaStageKey) => runPlan(stageKey, false);
  const forcePlan = (stageKey: GaStageKey) => runPlan(stageKey, true);

  const startDeploy = async (stageKey: GaStageKey, start: StartDeployment, forced: boolean) => {
    const generation = begin(stageKey, { state: "active", kind: "deploy", countdown: 0, retryCount: 0 }, forced ? "forced" : "deploy requested");
    const env = selectedEnvRef.current;
    const stage = stagesRef.current.find((item) => item.stage === stageKey);
    const definition = stageDefinitionsRef.current.find((item) => item.dir === stageKey);
    if (!accountRef.current || !repoNameRef.current || !env || !stage?.runId || !definition?.deployWorkflowId) {
      fail(stageKey, generation, "deploy", "Cannot start deployment: account, repository, environment, and plan run are required.");
      return;
    }
    const triggerTime = Date.now();
    trace(stageKey, "starting deployment terminal and workflow", generation);
    try {
      if (!await start(() => generations.current[stageKey] === generation)) {
        if (generations.current[stageKey] !== generation) {
          trace(stageKey, "ignored stale deploy startup result", generation);
          return;
        }
        fail(stageKey, generation, "deploy", "Failed to start the deployment terminal.");
        return;
      }
    } catch (error) {
      console.error("Failed to start the deployment terminal:", error);
      fail(stageKey, generation, "deploy", "Failed to start the deployment terminal.");
      return;
    }
    if (generations.current[stageKey] !== generation) {
      trace(stageKey, "ignored stale deploy startup result", generation);
      return;
    }
    trace(stageKey, "deployment workflow dispatched", generation);
    const ref = branchesRef.current.find((b) => b.name.toLowerCase() === env.name.toLowerCase())?.name ?? env.name;
    implRef.current.startPollingImpl(ref, 0, triggerTime, stageKey, "deploy", generation);
  };
  const deployStage = (stageKey: GaStageKey, start: StartDeployment) => startDeploy(stageKey, start, false);
  const forceDeploy = (stageKey: GaStageKey, start: StartDeployment) => startDeploy(stageKey, start, true);

  const forceIdle = (stageKey: GaStageKey) => { begin(stageKey, { state: "idle" }, "forced"); };
  const forceError = (stageKey: GaStageKey, kind: OperationKind) => {
    begin(stageKey, { state: "error", kind, error: `Forced ${kind} error state; no workflow failure is implied.` }, "forced");
  };

  const setStageSummary = useCallback((key: GaStageKey, summary: PlanSummary) => {
    const stage = stagesRef.current.find((item) => item.stage === key);
    if (!stage) return;
    setSummaryEntries((previous) => ({
      ...previous,
      [key]: { resultKey: gaResultKey(stage), summary },
    }));
  }, []);

  const latestSha = opts.branches.find((b) => b.name.toLowerCase() === opts.selectedEnv?.name.toLowerCase())?.commit;

  return {
    latestSha,
    stages,
    stageSummaries,
    hasPlan,
    stagesLoading,
    runs,
    deployedEnv,
    onRun,
    deployStage,
    forcePlan,
    forceDeploy,
    forceIdle,
    forceError,
    setStageSummary,
  };
}
