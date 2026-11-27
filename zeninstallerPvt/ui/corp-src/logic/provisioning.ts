/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Provisioning as a task graph (resource-provisioning-standard.md §6-8); tasks sharing an id run once. Pure, no React or api.

export type TaskStatus = "pending" | "running" | "completed" | "skipped" | "blocked" | "action_required" | "retrying" | "failed";

export type TaskOutcome = { status: "completed" | "skipped"; detail?: string; output?: unknown };

type TaskErrorKind = "transient" | "name_conflict" | "consent" | "forbidden" | "failed";

type TaskError = { kind: TaskErrorKind; code: string; message: string };

export type TaskContext = {
  // The output of a task this one depends on, by the module's own key.
  output: <T>(key: string) => T;
};

export type ProvisionTaskDef = {
  key: string; // The module's own step id, e.g. "rg".
  id?: string; // Canonical id when another module does the same operation; defaults to "<module>:<key>".
  label: string;
  dependsOn?: readonly string[]; // Keys in the same module.
  lockKeys?: readonly string[]; // Targets other tasks may also write; tasks sharing a key never run at once.
  resourceKey?: string; // The resource row this task creates: a name conflict here asks for a new name in that row.
  run: (ctx: TaskContext) => Promise<TaskOutcome>;
};

export type ProvisionModule = {
  id: string;
  label: string;
  tasks: readonly ProvisionTaskDef[];
  // Runs once every task of the module succeeded or was validly skipped, with the module's outputs by key.
  onComplete?: (output: <T>(key: string) => T) => void;
  onTaskError?: (error: unknown) => void; // e.g. hand a 403 to the module's access check.
};

type PlanTask = {
  id: string;
  label: string;
  def: ProvisionTaskDef;
  moduleId: string; // The module whose definition runs.
  dependsOn: string[]; // Canonical ids.
  lockKeys: string[];
  resourceKey?: string;
  stageIds: string[];
};

type PlanStage = { id: string; label: string; steps: { key: string; taskId: string; label: string }[] };

export type Plan = { tasks: Map<string, PlanTask>; stages: PlanStage[]; modules: Map<string, ProvisionModule> };

export type TaskState = {
  status: TaskStatus;
  detail?: string;
  attempts: number;
  error?: TaskError;
  output?: unknown;
  startedAt?: number;
  completedAt?: number;
  history: { attempt: number; status: TaskStatus; message?: string; at: number }[];
};

export type PlanState = Record<string, TaskState>;

const canonicalId = (module: ProvisionModule, def: ProvisionTaskDef) => def.id ?? `${module.id}:${def.key}`;

// Merges the modules into one graph and rejects unknown keys, duplicates and cycles before anything runs.
export function buildPlan(modules: readonly ProvisionModule[]): Plan {
  const tasks = new Map<string, PlanTask>();
  const stages: PlanStage[] = [];
  for (const module of modules) {
    const ids = new Map<string, string>();
    for (const def of module.tasks) {
      if (ids.has(def.key)) throw new Error(`${module.id}: duplicate task key "${def.key}"`);
      ids.set(def.key, canonicalId(module, def));
    }
    for (const def of module.tasks) {
      const id = ids.get(def.key)!;
      const dependsOn = (def.dependsOn ?? []).map((key) => {
        const dependency = ids.get(key);
        if (!dependency) throw new Error(`${module.id}:${def.key} depends on unknown task "${key}"`);
        return dependency;
      });
      const existing = tasks.get(id);
      if (existing) {
        // Same operation on the same target from another module: one task, both stages reference it.
        existing.dependsOn = [...new Set([...existing.dependsOn, ...dependsOn])];
        existing.lockKeys = [...new Set([...existing.lockKeys, ...(def.lockKeys ?? [])])];
        existing.stageIds.push(module.id);
      } else {
        tasks.set(id, {
          id,
          label: def.label,
          def,
          moduleId: module.id,
          dependsOn,
          lockKeys: [...(def.lockKeys ?? [])],
          resourceKey: def.resourceKey,
          stageIds: [module.id],
        });
      }
    }
    stages.push({ id: module.id, label: module.label, steps: module.tasks.map((def) => ({ key: def.key, taskId: ids.get(def.key)!, label: def.label })) });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Task dependency cycle: ${[...path, id].join(" → ")}`);
    visiting.add(id);
    for (const dependency of tasks.get(id)!.dependsOn) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of tasks.keys()) visit(id, []);

  return { tasks, stages, modules: new Map(modules.map((module) => [module.id, module])) };
}

export const isSettled = (status: TaskStatus | undefined) => status === "completed" || status === "skipped";

export function initialState(plan: Plan, previous: PlanState = {}): PlanState {
  return Object.fromEntries([...plan.tasks.keys()].map((id) => [id, previous[id] ?? { status: "pending", attempts: 0, history: [] }]));
}

// Leading status code of the api layer's errors ("409 /subscriptions/...: {...}").
function httpStatus(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") return status;
  const match = error instanceof Error ? /^(\d{3}) /.exec(error.message) : null;
  return match ? Number(match[1]) : null;
}

const NAME_TAKEN = /AlreadyExists|AlreadyTaken|NameNotAvailable|NameUnavailable|already (?:taken|in use|exists)|is not available/i;

export class ConsentRedirectError extends Error {
  constructor(message = "Additional consent required — redirecting to Microsoft...") {
    super(message);
    this.name = "ConsentRedirectError";
  }
}

// A name that can't be used as typed: the row asks for another one, like a name another tenant holds.
export class ResourceNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceNameError";
  }
}

// What went wrong decides what happens next: wait and retry, ask for a new name, or stop.
export function classifyError(error: unknown, task: Pick<PlanTask, "resourceKey">): TaskError {
  const message = error instanceof Error ? error.message : "Failed";
  const status = httpStatus(error);
  if (error instanceof ConsentRedirectError) return { kind: "consent", code: "consent_required", message };
  if (error instanceof ResourceNameError) return { kind: "name_conflict", code: "invalid_name", message };
  if (status === 403) return { kind: "forbidden", code: "403", message };
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return { kind: "transient", code: String(status), message };
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return { kind: "transient", code: "network", message };
  if (task.resourceKey && (status === 409 || status === 400) && NAME_TAKEN.test(message)) return { kind: "name_conflict", code: String(status), message };
  return { kind: "failed", code: status ? String(status) : "error", message };
}

// Retry requests that arrive while a run is still going, so a fixed task joins it instead of waiting.
export type RetryChannel = { push: (taskIds: readonly string[]) => void; take: () => string[]; next: () => Promise<void> };

export function createRetryChannel(): RetryChannel {
  let queued: string[] = [];
  let wake: (() => void) | null = null;
  return {
    push(taskIds) {
      queued.push(...taskIds);
      wake?.();
    },
    take() {
      const taken = queued;
      queued = [];
      return taken;
    },
    next: () => new Promise<void>((resolve) => { wake = resolve; }),
  };
}

type RunOptions = {
  retry?: readonly string[]; // Rerun only these and what they blocked; without it every unsettled task runs.
  retries?: RetryChannel;
  concurrency?: number; // A starting point, not an Azure limit.
  maxAttempts?: number; // For transient errors only.
  onUpdate?: (state: PlanState) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const RETRYABLE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

function retryDelay(error: unknown, attempt: number, random: () => number): number {
  const retryAfterMs = (error as { retryAfterMs?: unknown })?.retryAfterMs;
  if (typeof retryAfterMs === "number" && retryAfterMs >= 0) return Math.min(retryAfterMs, MAX_BACKOFF_MS * 4);
  const base = Math.min(MAX_BACKOFF_MS, RETRYABLE_BACKOFF_MS * 2 ** (attempt - 1));
  return base / 2 + random() * (base / 2);
}

// Runs ready tasks up to `concurrency` at a time; settled tasks are kept, so a retry reruns only what failed and its dependents.
export async function runPlan(getPlan: () => Plan, start: PlanState, options: RunOptions = {}): Promise<PlanState> {
  const { retry, retries, concurrency = 4, maxAttempts = 3, onUpdate, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), random = Math.random } = options;
  let plan = getPlan();
  let state: PlanState = initialState(plan, start);
  const set = (id: string, patch: Partial<TaskState>) => {
    const previous = state[id];
    const history = patch.status && patch.status !== previous.status
      ? [...previous.history, { attempt: patch.attempts ?? previous.attempts, status: patch.status, message: patch.error?.message ?? patch.detail, at: Date.now() }]
      : previous.history;
    state = { ...state, [id]: { ...previous, ...patch, history } };
    onUpdate?.(state);
  };
  const reopen = (taskIds: readonly string[] | null) => {
    for (const id of plan.tasks.keys()) {
      const status = state[id].status;
      const asked = taskIds ? taskIds.includes(id) && !isSettled(status) && status !== "running" && status !== "retrying" : !isSettled(status);
      if (asked || status === "blocked") state[id] = { ...state[id], status: "pending", error: undefined, detail: undefined };
    }
    onUpdate?.(state);
  };
  reopen(retry ?? null);

  const heldLocks = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();
  const ran = new Set<string>();

  const output = (moduleId: string) => <T>(key: string): T => {
    const taskId = plan.stages.find((stage) => stage.id === moduleId)?.steps.find((step) => step.key === key)?.taskId;
    if (!taskId) throw new Error(`${moduleId}: no task "${key}"`);
    return state[taskId]?.output as T;
  };

  const execute = async (task: PlanTask) => {
    ran.add(task.id);
    task.lockKeys.forEach((key) => heldLocks.add(key));
    try {
      for (let tries = 1; ; tries++) {
        set(task.id, { status: "running", attempts: state[task.id].attempts + 1, startedAt: Date.now(), error: undefined, detail: undefined });
        try {
          const outcome = await task.def.run({ output: output(task.moduleId) });
          set(task.id, { status: outcome.status, detail: outcome.detail, output: outcome.output, completedAt: Date.now() });
          return;
        } catch (error) {
          const classified = classifyError(error, task);
          if (classified.kind === "transient" && tries < maxAttempts) {
            set(task.id, { status: "retrying", error: classified, detail: `${classified.message} — retrying` });
            await sleep(retryDelay(error, tries, random));
            continue;
          }
          for (const id of task.stageIds) plan.modules.get(id)?.onTaskError?.(error);
          const status: TaskStatus = classified.kind === "name_conflict" || classified.kind === "consent" ? "action_required" : "failed";
          set(task.id, { status, error: classified, detail: classified.message, completedAt: Date.now() });
          return;
        }
      }
    } finally {
      task.lockKeys.forEach((key) => heldLocks.delete(key));
    }
  };

  for (;;) {
    plan = getPlan();
    const asked = retries?.take() ?? [];
    if (asked.length) reopen(asked);

    // Blocked: a dependency ended without success, so this one cannot start until that is fixed.
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of plan.tasks.values()) {
        if (state[task.id].status !== "pending") continue;
        const stuck = task.dependsOn.find((id) => ["failed", "action_required", "blocked"].includes(state[id].status));
        if (stuck) {
          set(task.id, { status: "blocked", detail: `Waiting for: ${plan.tasks.get(stuck)!.label}` });
          changed = true;
        }
      }
    }

    for (const task of plan.tasks.values()) {
      if (inFlight.size >= concurrency) break;
      if (state[task.id].status !== "pending" || inFlight.has(task.id)) continue;
      if (!task.dependsOn.every((id) => isSettled(state[id].status))) continue;
      if (task.lockKeys.some((key) => heldLocks.has(key))) continue;
      inFlight.set(task.id, execute(task).finally(() => inFlight.delete(task.id)));
    }

    if (inFlight.size === 0) break;
    await Promise.race([...inFlight.values(), ...(retries ? [retries.next()] : [])]);
  }

  // Only stages this run touched, so a retry elsewhere doesn't save an untouched stage's results again.
  for (const stage of plan.stages) {
    const touched = stage.steps.some((step) => ran.has(step.taskId));
    if (touched && stage.steps.every((step) => isSettled(state[step.taskId].status))) plan.modules.get(stage.id)?.onComplete?.(output(stage.id));
  }
  return state;
}

export type StageStatus = "pending" | "running" | "completed" | "blocked" | "action_required" | "failed";

// A stage reads its tasks: intervention first, then failure, running, blocked and pending.
export function stageStatus(stage: PlanStage, state: PlanState): StageStatus {
  const statuses = stage.steps.map((step) => state[step.taskId]?.status ?? "pending");
  if (statuses.includes("action_required")) return "action_required";
  if (statuses.includes("failed")) return "failed";
  if (statuses.some((status) => status === "running" || status === "retrying")) return "running";
  if (statuses.every(isSettled)) return "completed";
  if (statuses.includes("blocked")) return "blocked";
  return "pending";
}

// Each task counts once, however many stages list it.
export function planProgress(plan: Plan, state: PlanState) {
  const all = [...plan.tasks.keys()].map((id) => state[id]?.status ?? "pending");
  return {
    total: all.length,
    settled: all.filter(isSettled).length,
    running: all.filter((status) => status === "running" || status === "retrying").length,
    actionRequired: all.filter((status) => status === "action_required").length,
    failed: all.filter((status) => status === "failed").length,
  };
}
