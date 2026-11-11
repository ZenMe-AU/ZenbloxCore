/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PIPELINE } from "../logic/pipeline";
import { getStageSummaryText, getUnmetPrerequisites } from "../logic/stage";
import type { Account, Branch, CardId, CardStatus, GhEnv, Stage } from "../types";

const apiMocks = vi.hoisted(() => ({
  triggerWorkflow: vi.fn(),
  fetchStageReport: vi.fn(),
  getPlanEnv: vi.fn(),
}));
vi.mock("../api", () => apiMocks);

const { useDeploymentPlan } = await import("../cards/Stage/useDeploymentPlan");
type Plan = ReturnType<typeof useDeploymentPlan>;

const ACCOUNT = { login: "org-one", type: "Organization", id: 1 } as Account;
const ENV = { name: "PROD" } as GhEnv;

describe("stage header status", () => {
  const stage: Stage = { stage: "SubscriptionBudget", status: "failed" };

  it("names missing prerequisites without exposing configured values", () => {
    const missing = getUnmetPrerequisites([
      { type: "var", key: "NAME" },
      { type: "varGroup", keys: ["AZURE_CLIENT_ID", "AZURE_TENANT_ID"], label: "Azure" },
      { type: "stageVar", keys: ["CONTACT_EMAILS"], label: "Budget" },
      { type: "card", cardId: "azure_login" },
    ], { AZURE_CLIENT_ID: "configured-value", CONTACT_EMAILS: "  " }, {} as Record<CardId, CardStatus>);
    expect(missing).toEqual(["COMPANY_SHORT_CODE", "AZURE_TENANT_ID", "CONTACT_EMAILS", "azure_login"]);
    expect(getStageSummaryText(stage, undefined, false, false, false, missing))
      .toBe("Failed: COMPANY_SHORT_CODE, AZURE_TENANT_ID, CONTACT_EMAILS, azure_login not set");
    expect(getUnmetPrerequisites([{ type: "card", cardId: "azure_login" }], {}, { azure_login: "complete" } as Record<CardId, CardStatus>)).toEqual([]);
  });

  it("provides a useful fallback when the plan fails with prerequisites met", () => {
    expect(getStageSummaryText(stage, undefined, false, false)).toBe("Failed: Plan failed; check the GitHub Actions run");
  });

  it("shows unmet prerequisites before a plan is run without claiming failure", () => {
    expect(getStageSummaryText({ ...stage, status: "pending" }, undefined, false, false, false, ["CONTACT_EMAILS"]))
      .toBe("CONTACT_EMAILS not set");
    expect(getStageSummaryText(stage, undefined, false, false, false, ["CONTACT_EMAILS"]))
      .toBe("Failed: CONTACT_EMAILS not set");
    expect(getStageSummaryText({ ...stage, status: "pending" }, undefined, false, false, false, ["AWS_ROLE_ARN"]))
      .toBe("AWS_ROLE_ARN not set");
  });

  it("keeps loading, updating, completed, and skipped statuses ahead of prerequisite hints", () => {
    expect(getStageSummaryText(stage, undefined, true, false, false, ["CONTACT_EMAILS"])).toBe("Loading status...");
    expect(getStageSummaryText(stage, undefined, false, true, false, ["CONTACT_EMAILS"])).toBe("Status update required");
    expect(getStageSummaryText(stage, { create: 0, update: 0, delete: 0, replace: 0 }, false, false, false, ["CONTACT_EMAILS"])).toBe("No changes");
    expect(getStageSummaryText({ ...stage, status: "pending" }, undefined, false, false, true, ["CONTACT_EMAILS"])).toBe("Skipped");
  });

  it("distinguishes a failed deployment of the current plan from an older deployment", () => {
    const planned: Stage = { ...stage, status: "success", runId: "new", deployPlanRunId: "new", deployStatus: "failed" };
    expect(getStageSummaryText(planned, undefined, false, false)).toBe("Failed: Deployment failed; check the GitHub Actions run");
    expect(getStageSummaryText({ ...planned, deployPlanRunId: "old" }, undefined, false, false)).toBe("Ready to deploy");
    expect(getStageSummaryText({ ...planned, deployStatus: "cancelled" }, undefined, false, false)).toBe("Deployment cancelled; retry deployment");
    expect(getStageSummaryText({ ...planned, deployStatus: "success" }, undefined, false, false)).toBe("Deployed");
  });
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
beforeEach(() => {
  vi.clearAllMocks();
  reports.clear();
  apiMocks.getPlanEnv.mockResolvedValue(null);
  apiMocks.triggerWorkflow.mockResolvedValue(undefined);
  apiMocks.fetchStageReport.mockResolvedValue(null);
});

// Each stage is asked for its own task, so the mock answers per (dir, kind) pair.
const reports = new Map<string, { stage: object; createdAt: number }>();
function reportFor(dir: string, kind: "plan" | "deploy", stage: object, createdAt = 2000) {
  reports.set(`${kind}:${dir}`, { stage, createdAt });
  apiMocks.fetchStageReport.mockImplementation(
    async (_a: unknown, _r: unknown, _e: unknown, d: string, k: "plan" | "deploy") => reports.get(`${k}:${d}`) ?? null
  );
}

async function mount() {
  let latest: Plan | null = null;
  root = createRoot(document.createElement("div"));
  function Harness() {
    latest = useDeploymentPlan({
      account: ACCOUNT,
      repoName: "repo-one",
      pipeline: PIPELINE,
      selectedEnv: ENV,
      branches: [{ name: "PROD" }] as Branch[],
      branchMatchError: null,
      envReady: true,
    });
    return null;
  }
  await act(async () => {
    root!.render(React.createElement(Harness));
  });
  return () => latest!;
}

describe("Run Status Update triggers one stage", () => {
  it("dispatches the shared stage workflow with that stage's dir", async () => {
    const plan = await mount();

    await act(async () => {
      await plan().onRun("CloudFront");
    });

    expect(apiMocks.triggerWorkflow).toHaveBeenCalledTimes(1);
    const [, , workflowId, , , dir] = apiMocks.triggerWorkflow.mock.calls[0];
    expect(workflowId).toBe("plan.yml");
    expect(dir).toBe("CloudFront");
  });

  it("watches for the deploy report without dispatching — the remote terminal starts the run", async () => {
    // The hook finds the run id in its own loaded stages rather than being handed one.
    reportFor("CloudFront", "plan", { runId: "999", stage: "CloudFront", status: "success" });
    const plan = await mount();

    await act(async () => {
      await plan().deployStage("CloudFront");
    });

    expect(apiMocks.triggerWorkflow).not.toHaveBeenCalled();
    expect(plan().runs.CloudFront).toMatchObject({ kind: "deploy", retryCount: 0, error: null });
  });

});

describe("a failed plan reaches the card with something to show", () => {
  it("carries planLogId through, so the card can fetch the log instead of just saying failed", async () => {
    // Exactly what the workflow reports when the plan fails: no planJson, but a log.
    reportFor("SubscriptionBudget", "plan", {
      runId: "555",
      stage: "SubscriptionBudget",
      status: "failed",
      planJsonId: null,
      planLogId: 22,
      planLogUrl: "https://x/22",
    });

    const plan = await mount();
    const found = plan().stages.find((s) => s.stage === "SubscriptionBudget")!;
    expect(found.status).toBe("failed");
    expect(found.planLogId).toBe(22);
  });
});

describe("every result comes from that stage's own Deployment", () => {
  it("merges the plan report and the deploy report for the same stage", async () => {
    reportFor("SubscriptionBudget", "plan", { runId: "new", stage: "SubscriptionBudget", status: "success", planLogId: 7 });
    reportFor("SubscriptionBudget", "deploy", { deployStatus: "success", deployRunId: "42" });

    const plan = await mount();
    const found = plan().stages.find((s) => s.stage === "SubscriptionBudget")!;

    expect(found.status).toBe("success");
    expect(found.runId).toBe("new");
    expect(found.planLogId).toBe(7);
    expect(found.deployStatus).toBe("success");
    expect(found.deployRunId).toBe("42");
  });

  it("asks each stage for its own plan and deploy task — never one bulk list", async () => {
    await mount();
    const asked = apiMocks.fetchStageReport.mock.calls.map((c) => `${c[4]}:${c[3]}`).sort();
    const expected = PIPELINE.stages.flatMap((st) => [`plan:${st.dir}`, `deploy:${st.dir}`]).sort();
    expect(asked).toEqual(expected);
  });

  it("shows a stage that has never reported as pending, not failed", async () => {
    const plan = await mount();
    expect(plan().stages.every((st) => st.status === "pending")).toBe(true);
  });
});

describe("a run belongs to the card that started it", () => {
  it("leaves the other stages untouched while one is polling", async () => {
    const plan = await mount();

    await act(async () => {
      await plan().onRun("CloudFront");
    });

    expect(plan().runs["CloudFront"]).toBeDefined();
    expect(plan().runs["CloudFront"].kind).toBe("plan");
    // The point of the whole per-stage split: c01 must not be greyed out by c25's run.
    for (const other of PIPELINE.stages.filter((st) => st.dir !== "CloudFront")) {
      expect(plan().runs[other.dir]).toBeUndefined();
    }
  });

  it("keeps a trigger failure on that stage alone", async () => {
    apiMocks.triggerWorkflow.mockRejectedValueOnce(new Error("boom"));
    const plan = await mount();

    await act(async () => {
      await plan().onRun("GlobalGroups");
    });

    expect(plan().runs["GlobalGroups"].error).toBe("Failed to trigger workflow");
    expect(plan().runs["SubscriptionBudget"]).toBeUndefined();
  });

  it("counts down on its own clock, without dragging the others along", async () => {
    const plan = await mount();
    vi.useFakeTimers();
    try {
      await act(async () => {
        await plan().onRun("SubscriptionBudget");
      });
      const start = plan().runs["SubscriptionBudget"].countdown;

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      await act(async () => {
        await plan().onRun("CloudFront");
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(plan().runs["SubscriptionBudget"].countdown).toBe(start - 8);
      expect(plan().runs["CloudFront"].countdown).toBe(start - 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls once when a throttled timer resumes after the countdown deadline", async () => {
    const plan = await mount();
    vi.useFakeTimers();
    try {
      await act(async () => {
        await plan().onRun("SubscriptionBudget");
      });
      reportFor("SubscriptionBudget", "plan", {
        stage: "SubscriptionBudget", status: "success", runId: "completed-run",
      }, Date.now() + 150_000);
      apiMocks.fetchStageReport.mockClear();

      vi.setSystemTime(Date.now() + 150_000);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(apiMocks.fetchStageReport).toHaveBeenCalledTimes(PIPELINE.stages.length * 2);
      expect(plan().runs.SubscriptionBudget).toBeUndefined();
      expect(plan().stages.find((stage) => stage.stage === "SubscriptionBudget")?.runId).toBe("completed-run");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(apiMocks.fetchStageReport).toHaveBeenCalledTimes(PIPELINE.stages.length * 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not put the whole board into loading while one card polls", async () => {
    const plan = await mount();
    vi.useFakeTimers();
    try {
      await act(async () => {
        await plan().onRun("SubscriptionBudget");
      });
      // Long enough for the first poll to fire and re-fetch every stage's report.
      await act(async () => {
        vi.advanceTimersByTime(151_000);
      });
      expect(plan().stagesLoading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a deploy run as a deploy, not a plan", async () => {
    reportFor("CloudFront", "plan", { runId: "999", stage: "CloudFront", status: "success" });
    const plan = await mount();

    await act(async () => {
      await plan().deployStage("CloudFront");
    });

    expect(plan().runs["CloudFront"].kind).toBe("deploy");
  });
});

describe("stage workflow files", () => {
  // Each stage names its own file; today they all share plan.yml, which takes the stage as its dir input.
  it("plans every stage through plan.yml", () => {
    expect(PIPELINE.stages.map((s) => s.workflowId)).toEqual(PIPELINE.stages.map(() => "plan.yml"));
  });

  it("deploys every stage through deploy.yml", () => {
    expect(PIPELINE.stages.map((s) => s.deployWorkflowId)).toEqual(PIPELINE.stages.map(() => "deploy.yml"));
  });
});
