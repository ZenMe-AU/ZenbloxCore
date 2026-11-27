/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { AccountInfo } from "@azure/msal-browser";

export type AzureAccount = AccountInfo;

export type CardId =
  | "github_signup"
  | "github_login"
  | "github_login_v2"
  | "azure_login"
  | "azure_login_v2"
  | "repo"
  | "repo_v2"
  | "azure_subscription"
  | "azure_subscription_v2"
  | "azure_app_registration"
  | "azure_app_registration_v2"
  | "core_infra"
  | "backend_deploy"
  | "web_deploy"
  | "private_zeninstaller"
  | "dns_verify"
  | "access_pass"
  | "global_groups"
  | "create_admin_users"
  | "aws_login"
  | "privavd_gallery"
  | "privavd_image"
  | "privavd_paw"
  | "proto_card"
  | "aws_sso"
  | "aws_sso_stack"
  | `stage_${string}`;

export type CardStatus = "idle" | "loading" | "complete" | "warning" | "error" | "skipped" | "unavailable" | "locked";

export type Requirement = { label: string; target: CardId };

export type CardChrome = {
  cardId: CardId;
  status: CardStatus;
  summary?: string;
  locked: boolean;
  requirements: Requirement[];
  unavailable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRequirementClick: (id: CardId) => void;
};

export interface CardHook {
  readonly cardId: CardId;
  done: boolean;
  status: CardStatus;
  summary?: string;
  cardRequirements?: CardId[];
  cardDependencyLabel?: string;
  stage?: string;
}

export type Account = {
  login: string;
  type: "User" | "Organization";
  id: number;
};

export type Branch = {
  name: string;
  commit: string;
  protected: boolean;
};

export type GhEnv = {
  name: string;
  id: number;
  url: string;
};

export type PrerequisiteCard = { type: "card"; cardId: CardId };
export type PrerequisiteVar = { type: "var"; key: string };
export type PrerequisiteVarGroup = { type: "varGroup"; keys: readonly string[]; label: string };
export type PrerequisiteStageVar = {
  type: "stageVar";
  keys: readonly string[];
  label: string;
  descriptions?: Partial<Record<string, string>>;
};
export type Prerequisite = PrerequisiteCard | PrerequisiteVar | PrerequisiteVarGroup | PrerequisiteStageVar;

export type StageDefinition = {
  dir: string;
  label: string;
  description?: string;
  workflowId: string;
  deployWorkflowId: string;
  prerequisites: Prerequisite[];
  optional?: boolean;
  azurePermissions?: readonly string[];
  planPermissions?: readonly string[];
};

export type StageStatus = "deployed" | "success" | "failed" | "pending" | "skipped";
export type DeployStatus = "success" | "failed" | "cancelled";

export type Stage = {
  stage: string;
  status: StageStatus;
  planJsonId?: string;
  planJsonUrl?: string;
  planLogId?: number;
  planLogUrl?: string;
  envId?: number;
  envUrl?: string;
  runId?: string;
  planSha?: string;
  deployPlanRunId?: string;
  deployStatus?: DeployStatus;
  deployRunId?: string;
  deployedAt?: number;
  deployLogId?: number;
  deployLogUrl?: string;
};

export type GaResult = {
  stage: Stage;
  createdAt: number;
  sha?: string;
};

export type PlanSummary = { create: number; update: number; delete: number; replace: number };
export type PlanItem = {
  address: string;
  change: { actions: string[] };
};
export type ActionType = "create" | "delete" | "update" | "replace" | "noOp" | "unknown";

export type ArmScope = "tenant" | "subscription" | Readonly<{
  resourceGroup: string;
  resource?: string;
  locate?: boolean | string;
  mustExist?: boolean;
}>;
export type ArmChild = Readonly<{
  path: string;
  actions: readonly string[];
  dataActions?: readonly string[];
  children?: readonly ArmChild[];
}>;
export type ArmRole = Readonly<{
  scope: ArmScope;
  objectId?: string;
  actions: readonly string[];
  dataActions?: readonly string[];
  createActions?: readonly string[];
  children?: readonly ArmChild[];
}>;
export type CardResourceAccessRequest = Readonly<{
  resourceProviders: readonly string[];
  appConsent: readonly string[];
  armRoles: readonly ArmRole[];
  entraRoles: readonly string[];
}>;
