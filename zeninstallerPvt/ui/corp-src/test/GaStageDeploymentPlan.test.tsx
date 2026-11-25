/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Branch, GhEnv } from "../types";
import { GA_STAGE_DEFINITIONS } from "../cards/GaStage/stageDefinitions";

const apiMocks = vi.hoisted(() => ({
  triggerWorkflow: vi.fn(),
  fetchStageReport: vi.fn(),
  getPlanEnv: vi.fn(),
}));
vi.mock("../api", () => apiMocks);

const { useDeploymentPlan } = await import("../cards/GaStage/useDeploymentPlan");

const ACCOUNT = { login: "org-one", type: "Organization", id: 1 } as Account;
const ENV = { id: 1, name: "PROD" } as GhEnv;

describe("GA stage deployment plan", () => {
  let root: Root | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchStageReport.mockResolvedValue(null);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
  });

  it("loads plan and deploy reports for the explicit stage definitions", async () => {
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

    await act(async () => root!.render(<Harness />));
    await expect.poll(() => apiMocks.fetchStageReport).toHaveBeenCalledTimes(4);
    const queriedStages = apiMocks.fetchStageReport.mock.calls.map(([, , , dir, kind]) => `${dir}:${kind}`).sort();
    expect(queriedStages).toEqual([
      "CloudFront:deploy",
      "CloudFront:plan",
      "SubscriptionBudget:deploy",
      "SubscriptionBudget:plan",
    ]);
  });
});
