/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PIPELINE } from "../logic/pipeline";
import { assessPrerequisites, getEffectiveStatus, getStageSummaryText, getUnmetPrerequisites, stageToCardStatus } from "../logic/stage"; // Exercise the stage summary and warning-state decisions.
import type { Account, Branch, CardId, CardStatus, GhEnv, Stage } from "../types";

const apiMocks = vi.hoisted(() => ({
  triggerWorkflow: vi.fn(),
  fetchStageReport: vi.fn(),
  getPlanEnv: vi.fn(),
}));
vi.mock("../api", () => apiMocks);

const { useDeploymentPlan } = await import("../cards/Stage/useDeploymentPlan");
const { useCorpStageCards } = await import("../cards/Stage/useCorpStageCards");
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
      .toBe("COMPANY_SHORT_CODE, AZURE_TENANT_ID, CONTACT_EMAILS, azure_login not set"); // Missing inputs remain the actionable status.
    expect(getUnmetPrerequisites([{ type: "card", cardId: "azure_login" }], {}, { azure_login: "complete" } as Record<CardId, CardStatus>)).toEqual([]);
  });

  it("provides a useful fallback when the plan fails with prerequisites met", () => {
    expect(getStageSummaryText(stage, undefined, false, false)).toBe("Plan failed; check the GitHub Actions run"); // No redundant leading "Failed:" label.
  });

  it("treats empty prerequisites as ready and whitespace-only group values as missing", () => {
    // Empty requirement sets are ready, while whitespace-only values remain actionable blockers.
    expect(getUnmetPrerequisites([], {}, {} as Record<CardId, CardStatus>)).toEqual([]);
    expect(getUnmetPrerequisites(
      [{ type: "varGroup", keys: ["AZURE_CLIENT_ID", "AZURE_TENANT_ID"], label: "Azure" }],
      { AZURE_CLIENT_ID: "configured", AZURE_TENANT_ID: "   " },
      {} as Record<CardId, CardStatus>
    )).toEqual(["AZURE_TENANT_ID"]);
  });

  it("shows unmet prerequisites before a plan is run without claiming failure", () => {
    expect(getStageSummaryText({ ...stage, status: "pending" }, undefined, false, false, false, ["CONTACT_EMAILS"]))
      .toBe("CONTACT_EMAILS not set");
    expect(getStageSummaryText(stage, undefined, false, false, false, ["CONTACT_EMAILS"]))
      .toBe("CONTACT_EMAILS not set");
    expect(getStageSummaryText({ ...stage, status: "pending" }, undefined, false, false, false, ["AWS_ROLE_ARN"]))
      .toBe("AWS_ROLE_ARN not set");
  });

  it("keeps prerequisite hints ahead of loading, stale, completed and skipped statuses", () => {
    expect(getStageSummaryText(stage, undefined, true, false, false, ["CONTACT_EMAILS"])).toBe("CONTACT_EMAILS not set"); // The fixable blocker outranks a loading spinner.
    expect(getStageSummaryText(stage, undefined, false, true, false, ["CONTACT_EMAILS"])).toBe("CONTACT_EMAILS not set"); // ...and a stale-status reminder.
    expect(getStageSummaryText(stage, { create: 0, update: 0, delete: 0, replace: 0 }, false, false, false, ["CONTACT_EMAILS"])).toBe("CONTACT_EMAILS not set");
    expect(getStageSummaryText({ ...stage, status: "pending" }, undefined, false, false, true, ["CONTACT_EMAILS"])).toBe("CONTACT_EMAILS not set");
    expect(getStageSummaryText({ ...stage, status: "success", runId: "1", deployPlanRunId: "1", deployStatus: "success" }, undefined, false, false, false, ["CONTACT_EMAILS"])).toBe("CONTACT_EMAILS not set");
  });

  it("distinguishes a failed deployment of the current plan from an older deployment", () => {
    const planned: Stage = { ...stage, status: "success", runId: "new", deployPlanRunId: "new", deployStatus: "failed" };
    expect(getStageSummaryText(planned, undefined, false, false)).toBe("Failed: Deployment failed; check the GitHub Actions run");
    expect(getStageSummaryText({ ...planned, deployPlanRunId: "old" }, undefined, false, false)).toBe("Ready to deploy");
    expect(getStageSummaryText({ ...planned, deployStatus: "cancelled" }, undefined, false, false)).toBe("Deployment cancelled; retry deployment");
    expect(getStageSummaryText({ ...planned, deployStatus: "success" }, undefined, false, false)).toBe("Deployed");
  });

  it("uses red error status for failed plans and orange warning for unmet prerequisites", () => { // Keep the two states visually distinct.
    expect(stageToCardStatus("failed", false, false)).toBe("error"); // A failed plan with no blockers stays red.
    expect(stageToCardStatus("pending", false, false, true)).toBe("warning"); // An unmet prerequisite also uses orange warning.
    expect(stageToCardStatus("failed", false, false, true)).toBe("warning"); // Outstanding prerequisites take priority over the failed-plan state.
    expect(stageToCardStatus("pending", true, false, true)).toBe("warning");
    expect(stageToCardStatus("deployed", false, false, true)).toBe("warning");
    expect(stageToCardStatus("skipped", false, true, true)).toBe("warning");
  }); // End the failed-plan and unmet-prerequisite warning cases.

  it("assesses missing, incomplete and changed prerequisites without leaking values", () => {
    const prerequisites = [
      { type: "var" as const, key: "NAME" },
      { type: "varGroup" as const, keys: ["NAME", "AZURE_TENANT_ID"], label: "Azure" },
      { type: "stageVar" as const, keys: ["CONTACT_EMAILS"], label: "Budget" },
      { type: "card" as const, cardId: "azure_login" as CardId },
    ];
    const values = { NAME: "new-company", AZURE_TENANT_ID: "   ", CONTACT_EMAILS: "owner@example.com" };
    const snapshot = { NAME: "old-company", AZURE_TENANT_ID: "old-tenant", CONTACT_EMAILS: "owner@example.com" };
    expect(assessPrerequisites(prerequisites, values, {} as Record<CardId, CardStatus>, snapshot)).toEqual({
      missing: ["AZURE_TENANT_ID"], incomplete: ["azure_login"], changed: ["COMPANY_SHORT_CODE"], blocked: true,
      summary: "AZURE_TENANT_ID not set; azure login not complete; COMPANY_SHORT_CODE changed since last plan",
    });
    expect(assessPrerequisites(prerequisites, values, {} as Record<CardId, CardStatus>).changed).toEqual([]);
    expect(assessPrerequisites([], {}, {} as Record<CardId, CardStatus>).blocked).toBe(false);
  });

  it("does not let an old empty summary mask a failed or pending plan", () => {
    const empty = { create: 0, update: 0, delete: 0, replace: 0 };
    expect(getEffectiveStatus(stage, empty)).toBe("failed");
    expect(getStageSummaryText(stage, empty, false, false)).toBe("Plan failed; check the GitHub Actions run");
    expect(getEffectiveStatus({ ...stage, status: "pending" }, empty)).toBe("pending");
    expect(getStageSummaryText({ ...stage, status: "success" }, empty, false, false)).toBe("No changes");
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

async function mountModel(planOverrides: Partial<Plan> = {}, variableValues: Record<string, string> = {}) {
  let latest: ReturnType<typeof useCorpStageCards> = [];
  const plan: Plan = {
    stages: [{ stage: "SubscriptionBudget", status: "success", runId: "current" }],
    stageSummaries: {}, hasPlan: true, stagesLoading: false, runs: {}, deployedEnv: null,
    onRun: vi.fn().mockResolvedValue(undefined), deployStage: vi.fn().mockResolvedValue(undefined), setStageSummary: vi.fn(),
    ...planOverrides,
  };
  root = createRoot(document.createElement("div"));
  function Harness() {
    latest = useCorpStageCards({
      pipeline: { ...PIPELINE, stages: [{ ...PIPELINE.stages[0], prerequisites: [{ type: "stageVar", keys: ["CONTACT_EMAILS"], label: "Budget" }] }] },
      plan, allCards: {}, repoDone: true, expandedIds: new Set(), account: ACCOUNT, repoName: "repo-one", selectedEnv: ENV,
      variableValues, onVariableConfirmed: vi.fn(), onToggle: vi.fn(), onRequirementClick: vi.fn(),
    });
    return null;
  }
  await act(async () => root!.render(<Harness />));
  return { model: latest[0], plan };
}

describe("stage card prerequisite model", () => {
  it("puts current blockers ahead of run errors and historical completion", async () => {
    const { model, plan } = await mountModel({
      stages: [{ stage: "SubscriptionBudget", status: "success", runId: "current", deployPlanRunId: "current", deployStatus: "success" }],
      runs: { SubscriptionBudget: { kind: "plan", countdown: 0, retryCount: 0, error: "Old run error" } },
    });
    expect(model.card.summary).toBe("CONTACT_EMAILS not set");
    expect(model.card.status).toBe("warning");
    expect(model.prerequisiteAssessment.blocked).toBe(true);
    expect(model.statusUpdateDisabled).toBe(true);
    expect(model.trackDeploy).toBeUndefined();
    await model.onRunStatusUpdate();
    expect(plan.onRun).not.toHaveBeenCalled();
  });

  it("keeps changed inputs blocked but allows a prerequisite-level refresh", async () => {
    const { model, plan } = await mountModel({ deployedEnv: { CONTACT_EMAILS: "old@example.com" } }, { CONTACT_EMAILS: "new@example.com" });
    expect(model.card.summary).toBe("CONTACT_EMAILS changed since last plan");
    expect(model.card.status).toBe("warning");
    expect(model.prerequisiteAssessment.blocked).toBe(true);
    expect(model.deployDisabled).toBe(true);
    expect(model.trackDeploy).toBeUndefined();
    expect(model.statusUpdateDisabled).toBe(false);
    await model.onRunStatusUpdate();
    expect(plan.onRun).toHaveBeenCalledWith("SubscriptionBudget");
  });

  it("makes failed attempts retryable without presenting them as active", async () => {
    const { model, plan } = await mountModel({
      runs: { SubscriptionBudget: { kind: "plan", countdown: 0, retryCount: 0, error: "Failed to trigger workflow" } },
    }, { CONTACT_EMAILS: "owner@example.com" });
    expect(model.card.summary).toBe("Failed to trigger workflow");
    expect(model.card.status).toBe("warning");
    expect(model.statusUpdateRunning).toBe(false);
    expect(model.statusUpdateDisabled).toBe(false);
    await model.onRunStatusUpdate();
    expect(plan.onRun).toHaveBeenCalledOnce();
  });

  it("does not dispatch another refresh while one is already running", async () => {
    const { model, plan } = await mountModel({
      runs: { SubscriptionBudget: { kind: "plan", countdown: 10, retryCount: 0, error: null } },
    }, { CONTACT_EMAILS: "owner@example.com" });
    expect(model.card.summary).toBe("Plan running...");
    expect(model.statusUpdateDisabled).toBe(true);
    await model.onRunStatusUpdate();
    expect(plan.onRun).not.toHaveBeenCalled();
  });
});

describe("Run Status Update triggers one stage", () => {
  it("clears only the refreshed stage's prior summary", async () => {
    const plan = await mount();
    const empty = { create: 0, update: 0, delete: 0, replace: 0 };
    await act(async () => {
      plan().setStageSummary("SubscriptionBudget", empty);
      plan().setStageSummary("GlobalGroups", empty);
    });
    await act(async () => plan().onRun("SubscriptionBudget"));
    expect(plan().stageSummaries.SubscriptionBudget).toBeUndefined();
    expect(plan().stageSummaries.GlobalGroups).toEqual(empty);
  });

  it("invalidates another stage's summary when its report identity changes", async () => {
    reportFor("SubscriptionBudget", "plan", { stage: "SubscriptionBudget", status: "success", runId: "old", planJsonId: 1 });
    const plan = await mount();
    await act(async () => plan().setStageSummary("SubscriptionBudget", { create: 0, update: 0, delete: 0, replace: 0 }));
    vi.useFakeTimers();
    try {
      await act(async () => plan().onRun("GlobalGroups"));
      reportFor("SubscriptionBudget", "plan", { stage: "SubscriptionBudget", status: "success", runId: "new", planJsonId: 2 });
      reportFor("GlobalGroups", "plan", { stage: "GlobalGroups", status: "success", runId: "groups" }, Date.now() + 150_000);
      await act(async () => vi.advanceTimersByTimeAsync(151_000));
      expect(plan().stages.find((stage) => stage.stage === "SubscriptionBudget")?.runId).toBe("new");
      expect(plan().stageSummaries.SubscriptionBudget).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

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
