/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { PipelineConfig, StageDefinition } from "../types";
import { GRAPH_PERMISSIONS } from "../config/azureConfig";
import { AZURE_VARIABLE_KEYS, AWS_VARIABLE_KEYS, C01_KEYS } from "./variables";

type StageSource = Omit<StageDefinition, "workflowId">;
type PipelineSource = Omit<PipelineConfig, "stages"> & { stages: StageSource[] };
const DEFINITIONS: Record<string, PipelineSource> = {
  corpSetup: {
    workflowId: "planChanges.yml",
    deployWorkflowId: "remoteLogin.yml",
    label: "ZenInstaller Setup Central Corp Environment",
    templateRepo: "ZenMe-AU/ZenbloxCore",
    validEnvs: ["PROD", "TEST"] as const,
    stages: [
      {
        dir: "c01subscription",
        label: "Azure subscription budget",
        description: "Sets a spending budget on the Azure subscription and emails the contacts you list when costs approach it.",
        azurePermissions: [],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          {
            type: "stageVar",
            keys: C01_KEYS,
            label: "c01 variables",
            descriptions: {
              CONTACT_EMAILS: "Multiple emails — separate with a comma, e.g. alice@example.com,bob@example.com",
            },
          },
        ],
      },
      {
        dir: "c02globalGroups",
        label: "Organisation security groups",
        description: "Creates Entra security groups for privileged accounts, deployment, lead developers, and database administration. It nests groups and assigns directory and Azure roles to define access.",
        azurePermissions: [
          GRAPH_PERMISSIONS.GroupReadWriteAll,
          GRAPH_PERMISSIONS.GroupMemberReadWriteAll,
          // TODO: confirm if PIM-managed group membership is needed (azuread_role_eligibility_schedule in c02 is commented out)
          // GRAPH_PERMISSIONS.PrivilegedAccessReadWriteAzureADGroup,
        ],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      /*
       * c05rootrg was replaced by the Corp Domain Setup + Terraform Setup cards,
       * which create the same resources directly via ARM/Graph from the browser.
       */
      {
        dir: "c07userAccounts",
        label: "User accounts and sign-in",
        description: "Creates user accounts from your user list, sets up the security groups and memberships you specify, assigns each user's configured directory roles, enables FIDO2 as an authentication method, and verifies and sets your DNS domain as the tenant's primary domain.",
        azurePermissions: [
          GRAPH_PERMISSIONS.GroupReadWriteAll,
          GRAPH_PERMISSIONS.GroupMemberReadWriteAll,
          GRAPH_PERMISSIONS.UserReadWriteAll,
          GRAPH_PERMISSIONS.RoleManagementReadWriteDirectory,
          GRAPH_PERMISSIONS.UserAuthenticationMethodReadWriteAll,
          GRAPH_PERMISSIONS.PolicyReadWriteAuthenticationMethod,
          GRAPH_PERMISSIONS.DomainReadWriteAll,
        ],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        dir: "c20awsentrasso",
        label: "AWS single sign-on with Entra ID",
        description: "Creates an Entra enterprise app from the AWS Single-Account Access template and configures SAML sign-in for the AWS federation setup.",
        azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        dir: "c21awsentrassoP2",
        label: "AWS single sign-on with Microsoft Entra ID P2",
        description: "Connects the Entra AWS app to AWS with a SAML identity provider and administrator/read-only IAM roles, assigns the LeadDeveloper group, and maps the claims AWS uses to select a role.",
        azurePermissions: [GRAPH_PERMISSIONS.AppRoleAssignmentReadWriteAll, GRAPH_PERMISSIONS.PolicyReadWriteApplicationConfiguration],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
        ],
      },
      {
        dir: "c25cloudfront",
        label: "AWS CloudFront distribution",
        description: "Builds and hosts the corporate login app in S3, then serves it through CloudFront with DNS and HTTPS. Lambda@Edge functions protect requests using Entra sign-in.",
        azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
        ],
      },
    ],
  },
  // Add future pipelines here — no other files need to change
};

function withStageWorkflows(config: PipelineSource): PipelineConfig {
  return {
    ...config,
    stages: config.stages.map((stage) => ({ ...stage, workflowId: `plan-${stage.dir}.yml` })),
  };
}

export const PIPELINES: Record<string, PipelineConfig> = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([name, config]) => [name, withStageWorkflows(config)])
);

// The only pipeline in use — cards import this directly instead of it being threaded through hooks.
export const PIPELINE = PIPELINES.corpSetup;

export function matchPipelineByTemplate(templateName: string): string | null {
  const entry = Object.entries(PIPELINES).find(([, cfg]) => cfg.templateRepo === templateName);
  return entry ? entry[0] : null;
}
