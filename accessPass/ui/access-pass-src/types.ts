// ─── Card ─────────────────────────────────────────────────────────────────────

export type CardId = "auth" | "repo" | "azure_setup" | "azure_access_pass" | "aws_setup" | "pr" | "env" | "status_update" | "stages";
export type CardStatus = "idle" | "loading" | "complete" | "warning" | "error" | "skipped";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type User = { login: string };

// ─── Account & Repo ───────────────────────────────────────────────────────────

export type Account = {
  login: string;
  type: "User" | "Organization";
  id: number;
};

export type Repo = {
  id: number;
  name: string;
};

export type RepoOption = {
  id: number | string;
  name: string;
  isNew?: boolean;
};

// ─── Branch ───────────────────────────────────────────────────────────────────

export type Branch = {
  name: string;
  commit: string;
  protected: boolean;
};

export type BranchOption = {
  name: string;
  isNew?: boolean;
};

// ─── GitHub Environment ───────────────────────────────────────────────────────

export type GhEnv = {
  name: string;
  id: number;
  url: string;
};

// ─── Pull Request ─────────────────────────────────────────────────────────────

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

/** Shared across hooks that participate in URL-parameter restoration. */
export type PendingRestore = {
  account: string | null;
  repo: string | null;
  pr: string | null;
  env: string | null;
};

// ─── Workflow Run ─────────────────────────────────────────────────────────────

export type WorkflowRun = {
  id: number;
  head_sha: string;
  workflow_id: string;
  created_at: string;
  actor: string;
};

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export type PrerequisiteCard = { type: "card"; cardId: CardId };
export type PrerequisiteVar = { type: "var"; key: string };
export type PrerequisiteVarGroup = { type: "varGroup"; keys: readonly string[]; label: string };
/** Stage-local editable variables — checked like varGroup but also rendered as inline edit fields inside the stage card */
export type PrerequisiteStageVar = {
  type: "stageVar";
  keys: readonly string[];
  label: string;
  /** Optional per-key hint shown below the input field */
  descriptions?: Partial<Record<string, string>>;
};
export type Prerequisite = PrerequisiteCard | PrerequisiteVar | PrerequisiteVarGroup | PrerequisiteStageVar;

export type StageDefinition = {
  key: string;
  label: string;
  prerequisites: Prerequisite[];
  /** When true, a pending stage is treated as skipped rather than waiting. */
  optional?: boolean;
  /** Microsoft Graph application permission IDs required by this stage. */
  azurePermissions?: readonly string[];
};

export type PipelineConfig = {
  workflowId: string;
  label: string;
  templateRepo: string;
  validEnvs: readonly string[];
  stages: StageDefinition[];
};

// ─── Stage ────────────────────────────────────────────────────────────────────

export type StageStatus = "deployed" | "success" | "failed" | "pending" | "skipped";

export type Stage = {
  stage: string;
  status: StageStatus;
  planPath?: string;
  planJsonId?: string;
  planJsonUrl?: string;
  runId?: string;
  deployPlanRunId?: string;
  deployStatus?: string;
  deployRunId?: string;
  deployedAt?: number;
  deployLogId?: number;
  deployLogUrl?: string;
};

// ─── Secrets ──────────────────────────────────────────────────────────────────

export type SecretsStatus = {
  configured: boolean | null;
  valid: boolean | null;
};

export type UpsertSecretResult = {
  success: boolean;
  name: string;
  env: string;
};

// ─── Pending secrets / upsert ─────────────────────────────────────────────────

export type PendingSecret = { key: string; value: string };
export type UpsertStatus = { key: string; status: "success" | "error"; error?: string };

// ─── Plan view ────────────────────────────────────────────────────────────────

export type PlanSummary = { create: number; update: number; delete: number; replace: number };

export type PlanItem = {
  address: string;
  change: {
    actions: string[];
  };
};

export type ActionType = "create" | "delete" | "update" | "replace" | "noOp" | "unknown";
