/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardId, StageDefinition } from "../../types";
import { GRAPH_PERMISSIONS } from "../../config/azureConfig";
import { AZURE_VARIABLE_KEYS, AWS_VARIABLE_KEYS } from "../../logic/variables";

export const GA_CLOUDFRONT_CARD_ID = "stage_GA_CloudFront" satisfies CardId;

export const GA_CLOUDFRONT_STAGE = {
  dir: "CloudFront",
  label: "GA AWS CloudFront distribution",
  description: "Builds and hosts the corporate login app in S3, then serves it through CloudFront with DNS and HTTPS. Lambda@Edge functions protect requests using Entra sign-in.",
  workflowId: "plan.yml",
  deployWorkflowId: "deploy.yml",
  azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
  prerequisites: [
    { type: "var", key: "NAME" },
    { type: "var", key: "DNS" },
    { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
    { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
  ],
} satisfies StageDefinition;
