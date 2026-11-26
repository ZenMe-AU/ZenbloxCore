/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { GRAPH_PERMISSIONS } from "../config/azureConfig";
import GaCloudFront from "../cards/GaCloudFront/GaCloudFront";
import { GA_CLOUDFRONT_CARD_ID, GA_CLOUDFRONT_STAGE } from "../cards/GaCloudFront/config";
import type { CardId, CardStatus } from "../types";

describe("GaCloudFront", () => {
  const props: ComponentProps<typeof GaCloudFront> = {
    card: {
      cardId: GA_CLOUDFRONT_CARD_ID,
      status: "idle",
      locked: false,
      requirements: [],
      unavailable: false,
      expanded: false,
      onToggle: () => {},
      onRequirementClick: () => {},
    },
    stage: { stage: "CloudFront", status: "pending" },
    deployDisabled: true,
    deployedEnv: null,
    variableValues: {},
    cardStatus: {} as Record<CardId, CardStatus>,
    account: null,
    repoName: "",
    selectedEnv: null,
    onVariableConfirmed: () => {},
    onPlanSummary: () => {},
    onRunStatusUpdate: async () => {},
    statusUpdateRunning: false,
    statusUpdateCountdown: 0,
    statusUpdateDisabled: true,
    runError: null,
    azureAccount: null,
    operation: { state: "idle" },
    forcePlan: async () => {},
    forceDeploy: async () => {},
    forceIdle: () => {},
    forceError: () => {},
  };

  it("defines its own stage, permissions, and prerequisites", () => {
    expect(GA_CLOUDFRONT_CARD_ID).toBe("stage_GA_CloudFront");
    expect(GA_CLOUDFRONT_STAGE).toMatchObject({
      dir: "CloudFront",
      workflowId: "plan.yml",
      deployWorkflowId: "deploy.yml",
      azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
    });
    expect(GA_CLOUDFRONT_STAGE.prerequisites).toEqual(expect.arrayContaining([
      { type: "var", key: "NAME" },
      { type: "var", key: "DNS" },
      expect.objectContaining({ type: "varGroup", label: "Azure variables configured" }),
      expect.objectContaining({ type: "varGroup", label: "AWS variables configured" }),
    ]));
  });

  it("composes the shared stage card with its explicit definition", () => {
    expect(GaCloudFront(props).props.stageDef).toBe(GA_CLOUDFRONT_STAGE);
  });
});
