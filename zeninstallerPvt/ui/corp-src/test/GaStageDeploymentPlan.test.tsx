/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Branch, GhEnv } from "../types";
import type { UseDeploymentPlan } from "../cards/GaStage/useDeploymentPlan";
import { GA_STAGE_DEFINITIONS } from "../cards/GaStage/stageDefinitions";

const apiMocks = vi.hoisted(() => ({
  triggerWorkflow: vi.fn(),
  fetchStageReport: vi.fn(),
  getPlanEnv: vi.fn(),
}));
vi.mock("../cards/GaStage/api", () => apiMocks);

const { useDeploymentPlan } = await import("../cards/GaStage/useDeploymentPlan");

const ACCOUNT = { login: "org-one", type: "Organization", id: 1 } as Account;
const ENV = { id: 1, name: "PROD" } as GhEnv;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function TestProviders({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("GA stage deployment plan", () => {
  let root: Root | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    apiMocks.fetchStageReport.mockResolvedValue(null);
    apiMocks.triggerWorkflow.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("loads plan and deploy results for the explicit stage definitions", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    function Harness() {
      useDeploymentPlan({
        account: ACCOUNT,
        repoName: "repo-one",
        stageDefinitions: GA_STAGE_DEFINITIONS,
        selectedEnv: ENV,
        branches: [{ name: "PROD" }] as Branch[],
        branchMatchError: null,
        envReady: true,
      });
      return null;
    }

    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    await expect.poll(() => apiMocks.fetchStageReport).toHaveBeenCalledTimes(4);
    const queriedStages = apiMocks.fetchStageReport.mock.calls.map(([, , , dir, kind]) => `${dir}:${kind}`).sort();
    expect(queriedStages).toEqual([
      "CloudFront:deploy",
      "CloudFront:plan",
      "SubscriptionBudget:deploy",
      "SubscriptionBudget:plan",
    ]);
  });

  it("forces real plan transitions independently and ignores late dispatches", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => { });
    let resolveDispatch!: () => void;
    apiMocks.triggerWorkflow.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveDispatch = resolve; }));
    let plan!: UseDeploymentPlan;
    const container = document.createElement("div");
    root = createRoot(container);
    function Harness() {
      const currentPlan = useDeploymentPlan({
        account: ACCOUNT, repoName: "repo-one", stageDefinitions: GA_STAGE_DEFINITIONS,
        selectedEnv: ENV, branches: [{ name: "PROD" }] as Branch[], branchMatchError: null, envReady: false,
      });
      useLayoutEffect(() => { plan = currentPlan; }, [currentPlan]);
      return null;
    }
    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    let dispatch!: Promise<void>;
    await act(async () => { dispatch = plan.forcePlan("SubscriptionBudget"); });
    expect(apiMocks.triggerWorkflow).toHaveBeenCalledWith(ACCOUNT, "repo-one", expect.any(String), "PROD", "PROD", "SubscriptionBudget");
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "active", kind: "plan" });
    await act(async () => {
      plan.forceError("CloudFront", "deploy");
      plan.forceIdle("SubscriptionBudget");
      resolveDispatch();
      await dispatch;
    });
    expect(plan.runs.SubscriptionBudget).toBeUndefined();
    expect(plan.runs.CloudFront).toMatchObject({ state: "error", kind: "deploy" });
    await act(async () => plan.forcePlan("SubscriptionBudget"));
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "active", kind: "plan", countdown: 150 });
    await act(async () => plan.forceError("SubscriptionBudget", "plan"));
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "error", kind: "plan" });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/SubscriptionBudget.*idle -> plan active \(forced\)/));
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/SubscriptionBudget.*plan active -> idle \(forced\)/));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("ignored stale plan dispatch result"));
    info.mockRestore();
  });

  it("starts deployment, polls its result, and rejects missing inputs explicitly", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => { });
    vi.useFakeTimers();
    const now = Date.now();
    apiMocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir, kind) => {
      if (dir !== "SubscriptionBudget") return null;
      if (kind === "plan") return { createdAt: now - 1, stage: { stage: dir, status: "success", runId: "plan-1" } };
      return null;
    });
    let plan!: UseDeploymentPlan;
    const container = document.createElement("div");
    root = createRoot(container);
    function Harness() {
      const currentPlan = useDeploymentPlan({
        account: ACCOUNT, repoName: "repo-one", stageDefinitions: GA_STAGE_DEFINITIONS,
        selectedEnv: ENV, branches: [{ name: "PROD" }] as Branch[], branchMatchError: null, envReady: false,
      });
      useLayoutEffect(() => { plan = currentPlan; }, [currentPlan]);
      return null;
    }
    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    await expect.poll(() => plan.stages.find((stage) => stage.stage === "SubscriptionBudget")?.runId).toBe("plan-1");
    const start = vi.fn().mockResolvedValue(true);
    await act(async () => plan.forceDeploy("SubscriptionBudget", start));
    expect(start).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("deployment workflow dispatched"));
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "active", kind: "deploy", countdown: 150 });
    apiMocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir, kind) => {
      if (dir !== "SubscriptionBudget") return null;
      if (kind === "plan") return { createdAt: now - 1, stage: { stage: dir, status: "success", runId: "plan-1" } };
      return { createdAt: Date.now() + 1, stage: { stage: dir, deployStatus: "success", deployPlanRunId: "plan-1" } };
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(150_000); });
    expect(plan.runs.SubscriptionBudget).toBeUndefined();
    expect(plan.stages.find((stage) => stage.stage === "SubscriptionBudget")?.deployStatus).toBe("success");
    const error = vi.spyOn(console, "error").mockImplementation(() => { });
    info.mockClear();
    await act(async () => plan.forceDeploy("SubscriptionBudget", async () => false));
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "error", kind: "deploy" });
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining("deployment workflow dispatched"));
    await act(async () => plan.forceDeploy("CloudFront", start));
    expect(start).toHaveBeenCalledOnce();
    expect(plan.runs.CloudFront).toMatchObject({ state: "error", kind: "deploy", error: expect.stringContaining("plan run") });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    info.mockRestore();
  });

  it("does not resume tracking when a normal deployment startup completes after a forced transition", async () => {
    apiMocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir, kind) =>
      dir === "SubscriptionBudget" && kind === "plan"
        ? { createdAt: 1, stage: { stage: dir, status: "success", runId: "plan-1" } }
        : null,
    );
    let plan!: UseDeploymentPlan;
    root = createRoot(document.createElement("div"));
    function Harness() {
      const currentPlan = useDeploymentPlan({
        account: ACCOUNT, repoName: "repo-one", stageDefinitions: GA_STAGE_DEFINITIONS,
        selectedEnv: ENV, branches: [{ name: "PROD" }] as Branch[], branchMatchError: null, envReady: true,
      });
      useLayoutEffect(() => { plan = currentPlan; }, [currentPlan]);
      return null;
    }
    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    await expect.poll(() => plan.stages.find((stage) => stage.stage === "SubscriptionBudget")?.runId).toBe("plan-1");
    let finish!: (value: boolean) => void;
    let pending!: Promise<void>;
    await act(async () => {
      pending = plan.deployStage("SubscriptionBudget", () => new Promise<boolean>((resolve) => { finish = resolve; }));
    });
    await act(async () => {
      plan.forceIdle("SubscriptionBudget");
      finish(true);
      await pending;
    });
    expect(plan.runs.SubscriptionBudget).toBeUndefined();
  });

  it("retries stale results, times out, and resets when the environment changes", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => { });
    let plan!: UseDeploymentPlan;
    let selectedEnv = ENV;
    const container = document.createElement("div");
    root = createRoot(container);
    function Harness() {
      const currentPlan = useDeploymentPlan({
        account: ACCOUNT, repoName: "repo-one", stageDefinitions: GA_STAGE_DEFINITIONS,
        selectedEnv, branches: [{ name: "PROD" }, { name: "DEV" }] as Branch[], branchMatchError: null, envReady: true,
      });
      useLayoutEffect(() => { plan = currentPlan; }, [currentPlan]);
      return null;
    }
    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    await act(async () => plan.forcePlan("SubscriptionBudget"));
    await act(async () => { await vi.advanceTimersByTimeAsync(150_000); });
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "active", retryCount: 1, countdown: 180 });
    await act(async () => { await vi.advanceTimersByTimeAsync(680_000); });
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "error", kind: "plan", error: expect.stringContaining("too long") });
    selectedEnv = { ...ENV, id: 2, name: "DEV" };
    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    expect(plan.runs.SubscriptionBudget).toBeUndefined();
    error.mockRestore();
  });

  it("ignores an in-flight result after forcing a different state", async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, "info");
    let resolveReport!: (value: null) => void;
    let plan!: UseDeploymentPlan;
    const container = document.createElement("div");
    root = createRoot(container);
    function Harness() {
      const currentPlan = useDeploymentPlan({
        account: ACCOUNT, repoName: "repo-one", stageDefinitions: GA_STAGE_DEFINITIONS,
        selectedEnv: ENV, branches: [{ name: "PROD" }] as Branch[], branchMatchError: null, envReady: true,
      });
      useLayoutEffect(() => { plan = currentPlan; }, [currentPlan]);
      return null;
    }
    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    await act(async () => plan.forcePlan("SubscriptionBudget"));
    apiMocks.fetchStageReport.mockImplementationOnce(() => new Promise<null>((resolve) => { resolveReport = resolve; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(150_000); });
    await act(async () => {
      plan.forceError("SubscriptionBudget", "deploy");
      resolveReport(null);
      await Promise.resolve();
    });
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "error", kind: "deploy" });
    expect(info).toHaveBeenCalledWith(expect.stringContaining("ignored stale result response"));
    await act(async () => { await vi.advanceTimersByTimeAsync(200_000); });
    expect(plan.runs.SubscriptionBudget).toMatchObject({ state: "error", kind: "deploy" });
    info.mockRestore();
  });

  it("allows every forced operation state from every other state", async () => {
    apiMocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir, kind) =>
      dir === "SubscriptionBudget" && kind === "plan"
        ? { createdAt: 1, stage: { stage: dir, status: "success", runId: "plan-1" } }
        : null,
    );
    let plan!: UseDeploymentPlan;
    root = createRoot(document.createElement("div"));
    function Harness() {
      const currentPlan = useDeploymentPlan({
        account: ACCOUNT, repoName: "repo-one", stageDefinitions: GA_STAGE_DEFINITIONS,
        selectedEnv: ENV, branches: [{ name: "PROD" }] as Branch[], branchMatchError: null, envReady: false,
      });
      useLayoutEffect(() => { plan = currentPlan; }, [currentPlan]);
      return null;
    }
    await act(async () => root!.render(<TestProviders><Harness /></TestProviders>));
    const start = vi.fn().mockResolvedValue(true);
    const choices = [
      { expected: undefined, transition: () => plan.forceIdle("SubscriptionBudget") },
      { expected: { state: "active", kind: "plan" }, transition: () => plan.forcePlan("SubscriptionBudget") },
      { expected: { state: "active", kind: "deploy" }, transition: () => plan.forceDeploy("SubscriptionBudget", start) },
      { expected: { state: "error", kind: "plan" }, transition: () => plan.forceError("SubscriptionBudget", "plan") },
      { expected: { state: "error", kind: "deploy" }, transition: () => plan.forceError("SubscriptionBudget", "deploy") },
    ];
    for (const from of choices) {
      for (const to of choices) {
        await act(async () => { await from.transition(); });
        await act(async () => { await to.transition(); });
        if (to.expected) expect(plan.runs.SubscriptionBudget).toMatchObject(to.expected);
        else expect(plan.runs.SubscriptionBudget).toBeUndefined();
      }
    }
  });
});
