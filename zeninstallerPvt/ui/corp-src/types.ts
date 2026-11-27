/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/*
 * DEPRECATED LEGACY TYPE MODULE — CARD TYPE MIGRATION TASK
 * Do not add new card contracts to this legacy type bucket. Keep the existing exports
 * until each consuming card is refactored. During that refactor, move shared data to
 * AppContext, common display and lifecycle data to BaseCardContext, and card-specific
 * UI or state data to that card's PrivateContext. Types that remain genuinely shared
 * domain data may move to an appropriate shared domain module.
 */

import type { AccountInfo } from "@azure/msal-browser";

/** @deprecated See the card type migration task at the top of this file. */
export type AzureAccount = AccountInfo;
/** @deprecated See the card type migration task at the top of this file. */
export type AzureTenant = { tenantId: string; displayName: string; defaultDomain?: string };

// ─── Card ─────────────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
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
/** @deprecated See the card type migration task at the top of this file. */
export type CardStatus = "idle" | "loading" | "complete" | "warning" | "error" | "skipped" | "unavailable" | "locked";

/** @deprecated See the card type migration task at the top of this file. */
export type CardRequirements = CardId[]; //["github_login","repo"]

// A missing prerequisite, plus the card that resolves it (so it can be clicked to jump there).
/** @deprecated See the card type migration task at the top of this file. */
export type Requirement = { label: string; target: CardId };

// Everything App derives for a card's frame — exactly what cardProps() returns and Card renders.
/** @deprecated See the card type migration task at the top of this file. */
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

// Every card-backing hook self-reports its own completion via `done`, plus the face
// App renders for it (status icon + collapsed summary), so other cards can query it and
// App never has to re-derive per-card state itself.
/** @deprecated See the card type migration task at the top of this file. */
export interface CardHook {
  readonly cardId: CardId;
  done: boolean;
  status: CardStatus;
  summary?: string;
  cardRequirements?: CardRequirements;
  cardDependencyLabel?: string;
  stage?: string;
}

// ─── Card access ──────────────────────────────────────────────────────────────

// Where an ArmRole's actions are checked; a resource Azure doesn't have yet is checked at its nearest existing parent.
/** @deprecated See the card type migration task at the top of this file. */
export type ArmScope = "tenant" | "subscription" | Readonly<{
  resourceGroup: string;
  resource?: string; // under the group's providers, e.g. "Microsoft.Storage/storageAccounts/name/blobServices/default"
  // true: use the group Azure already has the top-level resource in; a path such as "Microsoft.Web/sites/name": use that resource's group; else resourceGroup
  locate?: boolean | string;
  mustExist?: boolean; // fail instead of falling back when the resource doesn't exist
}>;
// Checked under its parent resource and in the same group; path is relative, e.g. "blobServices/default".
// dataActions are data-plane actions such as reading table entities, checked at the same scope.
/** @deprecated See the card type migration task at the top of this file. */
export type ArmChild = Readonly<{ path: string; actions: readonly string[]; dataActions?: readonly string[]; children?: readonly ArmChild[] }>;
// objectId is the Entra object id of the user, group or service principal whose role assignments are checked at scope; leave it out to check the signed-in user. Children inherit it.
// createActions are checked at the subscription only while the scope's resource doesn't exist, e.g. its checkNameAvailability.
/** @deprecated See the card type migration task at the top of this file. */
export type ArmRole = Readonly<{ scope: ArmScope; objectId?: string; actions: readonly string[]; dataActions?: readonly string[]; createActions?: readonly string[]; children?: readonly ArmChild[] }>;
// One Azure role assignment: the scope it was made at and the role definition it grants.
/** @deprecated See the card type migration task at the top of this file. */
export type RoleAssignment = { scope: string; roleDefinitionId: string };

// What a card needs; each card's config lists every field, empty when unused.
/** @deprecated See the card type migration task at the top of this file. */
export type CardResourceAccessRequest = Readonly<{
  // Resource providers registered on the subscription before deploying.
  // Azure portal: Subscriptions > (subscription) > Settings > Resource providers.
  resourceProviders: readonly string[];
  // Delegated scopes beyond sign-in the user must consent to (not checked yet).
  // Entra admin center: Entra ID > Enterprise apps > (this installer) > Permissions > Grant admin consent.
  appConsent: readonly string[];
  // Azure actions per scope: "tenant", "subscription", a resource group, or a resource in one.
  // Azure portal: (scope) > Access control (IAM) > Add role assignment; "tenant" is Management groups > Tenant Root Group.
  armRoles: readonly ArmRole[];
  // Entra actions the signed-in user needs.
  // Entra admin center: Entra ID > Roles & admins > (role) > Add assignments.
  entraRoles: readonly string[];
}>;

// ─── Composable hook shapes ───────────────────────────────────────────────────
/** @deprecated See the card type migration task at the top of this file. */
export interface LoginHook<TAccount> {
  account: TAccount | null;
  loggingIn: boolean;
  login: () => void | Promise<void>;
  logout: () => void | Promise<void>;
  refresh: () => void | Promise<void>;
}

/** @deprecated See the card type migration task at the top of this file. */
export interface ResettableHook {
  reset: () => void;
}

/** @deprecated See the card type migration task at the top of this file. */
export interface AzureConfigHook extends ResettableHook {
  steps: SetupStep[];
  running: boolean;
  run: () => Promise<void>;
}

/** @deprecated See the card type migration task at the top of this file. */
export interface AzureTarget {
  azureAccount: AzureAccount | null;
  subscriptionId: string;
  tenantId?: string; // MSA (personal) accounts sign in via the consumer tenant, so the real AAD tenant is passed explicitly.
}
/** @deprecated See the card type migration task at the top of this file. */
export interface AzureSpTarget extends AzureTarget {
  spClientId: string; // Client id of the GitHub Actions app registration (AZURE_CLIENT_ID variable).
}

/** @deprecated See the card type migration task at the top of this file. */
export type SetupStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  detail?: string;
  progress?: number; // 0-1, renders a bar under the detail line
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type User = { login: string };

// ─── Account & Repo ───────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type Account = {
  login: string;
  type: "User" | "Organization";
  id: number;
};

/** @deprecated See the card type migration task at the top of this file. */
export type Repo = {
  id: number;
  name: string;
};

/** @deprecated See the card type migration task at the top of this file. */
export type RepoOption = {
  id: number | string;
  name: string;
  isNew?: boolean;
};

// ─── Branch ───────────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type Branch = {
  name: string;
  commit: string;
  protected: boolean;
};

/** @deprecated See the card type migration task at the top of this file. */
export type BranchOption = {
  name: string;
  isNew?: boolean;
};

// ─── GitHub Environment ───────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type GhEnv = {
  name: string;
  id: number;
  url: string;
};

// ─── Pull Request ─────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type PullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  base_branch: string;
  head_sha: string;
};

// ─── URL Restore ─────────────────────────────────────────────────────────────

// Shared across hooks that participate in URL-parameter restoration.
/** @deprecated See the card type migration task at the top of this file. */
export type PendingRestore = {
  account: string | null;
  repo: string | null;
  pr: string | null;
  env: string | null;
};

// ─── Workflow Run ─────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type WorkflowRun = {
  id: number;
  head_sha: string;
  workflow_id: string;
  created_at: string;
  actor: string;
};

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type PrerequisiteCard = { type: "card"; cardId: CardId };
/** @deprecated See the card type migration task at the top of this file. */
export type PrerequisiteVar = { type: "var"; key: string };
/** @deprecated See the card type migration task at the top of this file. */
export type PrerequisiteVarGroup = { type: "varGroup"; keys: readonly string[]; label: string };
// Stage-local editable variables — checked like varGroup but also rendered as inline edit fields inside the stage card
/** @deprecated See the card type migration task at the top of this file. */
export type PrerequisiteStageVar = {
  type: "stageVar";
  keys: readonly string[];
  label: string;
  descriptions?: Partial<Record<string, string>>; // Optional per-key hint shown below the input field
};
/** @deprecated See the card type migration task at the top of this file. */
export type Prerequisite = PrerequisiteCard | PrerequisiteVar | PrerequisiteVarGroup | PrerequisiteStageVar;

/** @deprecated See the card type migration task at the top of this file. */
export type StageDefinition = {
  dir: string;
  label: string; // Shown on the card
  description?: string; // One-line overview shown on the card, including while locked
  workflowId: string; // Plans this stage; dispatched with the stage's dir.
  deployWorkflowId: string; // Applies this stage's plan; dispatched with the stage's dir.
  prerequisites: Prerequisite[];
  optional?: boolean; // When true, a pending stage is treated as skipped rather than waiting.
  azurePermissions?: readonly string[]; // Microsoft Graph permissions deploying this stage needs; deploy runs as the signed-in user.
  planPermissions?: readonly string[]; // Microsoft Graph application permission IDs AZURE_PLAN_CLIENT_ID needs to plan this stage.
};

/** @deprecated See the card type migration task at the top of this file. */
export type PipelineConfig = {
  label: string;
  templateRepo: string;
  validEnvs: readonly string[];
  stages: StageDefinition[];
};

// ─── Stage ────────────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type StageStatus = "deployed" | "success" | "failed" | "pending" | "skipped";
/** @deprecated See the card type migration task at the top of this file. */
export type DeployStatus = "success" | "failed" | "cancelled";

/** @deprecated See the card type migration task at the top of this file. */
export type Stage = {
  stage: string;
  status: StageStatus;
  planJsonId?: string;
  planJsonUrl?: string;
  // "failed" alone says nothing, so the plan publishes its output the way the deploy does.
  planLogId?: number;
  planLogUrl?: string;
  // The merged corp.env artifact from the run that produced this plan.
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

// One stage's latest plan result as the workflow recorded it, plus when it was recorded — the
// timestamp is what tells a poll whether the run it triggered has reported yet.
/** @deprecated See the card type migration task at the top of this file. */
export type StageReport = {
  stage: Stage;
  createdAt: number;
  // GitHub resolves the deployment's branch ref to a commit; the payload itself carries no sha.
  sha?: string;
};

// ─── Secrets ──────────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type SecretsStatus = {
  configured: boolean | null;
  valid: boolean | null;
};

/** @deprecated See the card type migration task at the top of this file. */
export type UpsertSecretResult = {
  success: boolean;
  name: string;
  env: string;
};

// ─── Pending secrets / upsert ─────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type PendingSecret = { key: string; value: string };
/** @deprecated See the card type migration task at the top of this file. */
export type UpsertStatus = { key: string; status: "success" | "error"; error?: string };

// ─── Plan view ────────────────────────────────────────────────────────────────

/** @deprecated See the card type migration task at the top of this file. */
export type PlanSummary = { create: number; update: number; delete: number; replace: number };

/** @deprecated See the card type migration task at the top of this file. */
export type PlanItem = {
  address: string;
  change: {
    actions: string[];
  };
};

/** @deprecated See the card type migration task at the top of this file. */
export type ActionType = "create" | "delete" | "update" | "replace" | "noOp" | "unknown";
