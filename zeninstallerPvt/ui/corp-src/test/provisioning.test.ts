/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it, vi } from "vitest";
import { AzureHttpError } from "../api/azureFetch";
import {
  buildPlan,
  classifyError,
  createRetryChannel,
  planProgress,
  runPlan,
  stageStatus,
  type ProvisionModule,
  type ProvisionTaskDef,
} from "../logic/provisioning";

const done = async () => ({ status: "completed" as const });
const task = (key: string, dependsOn: string[] = [], extra: Partial<ProvisionTaskDef> = {}): ProvisionTaskDef => ({ key, label: `Task ${key}`, dependsOn, run: done, ...extra });
const noWait = { sleep: async () => {}, random: () => 0 };

// Resolves when released, so a test can see what runs at the same time.
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe("buildPlan", () => {
  it("merges a shared task once and keeps both stages pointing at it", () => {
    const rg = vi.fn(done);
    const core: ProvisionModule = { id: "core", label: "Core", tasks: [task("rg", [], { id: "shared:rg", run: rg }), task("storage", ["rg"])] };
    const dns: ProvisionModule = { id: "dns", label: "DNS", tasks: [task("rg", [], { id: "shared:rg", label: "Ensure group" }), task("zone", ["rg"])] };
    const plan = buildPlan([core, dns]);
    expect([...plan.tasks.keys()]).toEqual(["shared:rg", "core:storage", "dns:zone"]);
    expect(plan.tasks.get("shared:rg")!.stageIds).toEqual(["core", "dns"]);
    // Each stage keeps its own label for the shared step.
    expect(plan.stages[1].steps[0]).toMatchObject({ key: "rg", taskId: "shared:rg", label: "Ensure group" });
  });

  it("rejects unknown dependencies, duplicate keys and cycles before anything runs", () => {
    expect(() => buildPlan([{ id: "m", label: "M", tasks: [task("a", ["missing"])] }])).toThrow(/unknown task "missing"/);
    expect(() => buildPlan([{ id: "m", label: "M", tasks: [task("a"), task("a")] }])).toThrow(/duplicate task key/);
    expect(() => buildPlan([{ id: "m", label: "M", tasks: [task("a", ["b"]), task("b", ["a"])] }])).toThrow(/cycle/);
  });
});

describe("runPlan", () => {
  it("creates a shared resource once, runs independent tasks together and counts progress once", async () => {
    const rg = vi.fn(done);
    const storage = gate();
    const zone = gate();
    const started: string[] = [];
    const core: ProvisionModule = {
      id: "core",
      label: "Core",
      tasks: [
        task("rg", [], { id: "shared:rg", run: rg }),
        task("storage", ["rg"], { run: async () => { started.push("storage"); await storage.promise; return { status: "completed" }; } }),
      ],
    };
    const dns: ProvisionModule = {
      id: "dns",
      label: "DNS",
      tasks: [task("rg", [], { id: "shared:rg", run: rg }), task("zone", ["rg"], { run: async () => { started.push("zone"); await zone.promise; return { status: "completed" }; } })],
    };
    const plan = buildPlan([core, dns]);
    const running = runPlan(() => plan, {}, noWait);
    await vi.waitFor(() => expect(started).toEqual(["storage", "zone"]));
    storage.release();
    zone.release();
    const state = await running;
    expect(rg).toHaveBeenCalledTimes(1);
    expect(planProgress(plan, state)).toMatchObject({ total: 3, settled: 3 });
    expect(stageStatus(plan.stages[0], state)).toBe("completed");
  });

  it("never runs two tasks that share a lock key at the same time", async () => {
    let active = 0;
    let most = 0;
    const write = async () => {
      active++;
      most = Math.max(most, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { status: "completed" as const };
    };
    const plan = buildPlan([{ id: "m", label: "M", tasks: [task("a", [], { lockKeys: ["diag"], run: write }), task("b", [], { lockKeys: ["diag"], run: write }), task("c", [], { run: write })] }]);
    await runPlan(() => plan, {}, noWait);
    // a and b share the lock; c is free to overlap with either.
    expect(most).toBe(2);
  });

  it("asks for a new name on a conflict, blocks only what needs it, and retries only that part", async () => {
    let name = "wps-148594";
    const wps = vi.fn(async () => {
      if (name === "wps-148594") throw new AzureHttpError(409, `409 /webPubSub/${name}: {"code":"NameNotAvailable"}`);
      return { status: "completed" as const, output: name };
    });
    const storage = vi.fn(done);
    const onComplete = vi.fn();
    const module = (): ProvisionModule => ({
      id: "backend",
      label: "Backend",
      onComplete,
      tasks: [task("storage", [], { run: storage }), task("wps", [], { resourceKey: "webPubSub", run: wps }), task("hub", ["wps"]), task("table", ["storage"])],
    });
    let plan = buildPlan([module()]);
    let state = await runPlan(() => plan, {}, noWait);
    expect(state["backend:wps"]).toMatchObject({ status: "action_required", error: { kind: "name_conflict", code: "409" } });
    expect(state["backend:hub"].status).toBe("blocked");
    expect(state["backend:table"].status).toBe("completed");
    expect(onComplete).not.toHaveBeenCalled();

    name = "wps-148595";
    plan = buildPlan([module()]);
    state = await runPlan(() => plan, state, { ...noWait, retry: ["backend:wps"] });
    expect(state["backend:wps"]).toMatchObject({ status: "completed", output: "wps-148595", attempts: 2 });
    expect(state["backend:hub"].status).toBe("completed");
    // The storage account that already succeeded is not touched again.
    expect(storage).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(planProgress(plan, state).total).toBe(4);
  });

  it("waits Retry-After on throttling, then succeeds; a 403 fails at once and is not a name problem", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const throttled = async () => {
      if (++calls === 1) throw new AzureHttpError(429, "429 /x: busy", 7000);
      return { status: "completed" as const };
    };
    const forbidden = vi.fn(async () => { throw new AzureHttpError(403, "403 /subscriptions/s/resourceGroups/rg: AuthorizationFailed"); });
    const onTaskError = vi.fn();
    const plan = buildPlan([{ id: "m", label: "M", onTaskError, tasks: [task("a", [], { run: throttled }), task("b", [], { resourceKey: "row", run: forbidden })] }]);
    const state = await runPlan(() => plan, {}, { sleep, random: () => 0 });
    expect(sleep).toHaveBeenCalledWith(7000);
    expect(state["m:a"]).toMatchObject({ status: "completed", attempts: 2 });
    expect(state["m:a"].history.map((entry) => entry.status)).toEqual(["running", "retrying", "running", "completed"]);
    expect(state["m:b"]).toMatchObject({ status: "failed", error: { kind: "forbidden", code: "403" } });
    expect(forbidden).toHaveBeenCalledTimes(1);
    expect(onTaskError).toHaveBeenCalledTimes(1);
  });

  it("picks up a retry pushed while other tasks are still running", async () => {
    const slow = gate();
    let fail = true;
    const plan = buildPlan([
      {
        id: "m",
        label: "M",
        tasks: [
          task("slow", [], { run: async () => { await slow.promise; return { status: "completed" }; } }),
          task("flaky", [], { resourceKey: "row", run: async () => { if (fail) throw new Error("409 /x: AlreadyExists"); return { status: "completed" }; } }),
        ],
      },
    ]);
    const retries = createRetryChannel();
    const states: string[] = [];
    const running = runPlan(() => plan, {}, { ...noWait, retries, onUpdate: (state) => states.push(state["m:flaky"].status) });
    await vi.waitFor(() => expect(states.at(-1)).toBe("action_required"));
    fail = false;
    retries.push(["m:flaky"]);
    await vi.waitFor(() => expect(states.at(-1)).toBe("completed"));
    slow.release();
    const state = await running;
    expect(state["m:slow"].status).toBe("completed");
  });

  it("classifies consent and plain failures", () => {
    expect(classifyError(new TypeError("Failed to fetch"), {}).kind).toBe("transient");
    expect(classifyError(new Error("409 /x: AlreadyExists"), {}).kind).toBe("failed"); // No resource row to rename.
    expect(classifyError("bad", {})).toEqual({ kind: "failed", code: "error", message: "Failed" });
  });
});
