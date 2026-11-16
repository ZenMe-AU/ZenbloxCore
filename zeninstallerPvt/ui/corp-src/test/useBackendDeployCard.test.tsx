import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBackendDeployCard, type UseBackendDeployCard } from "../cards/BackendDeploy/useBackendDeployCard";
import type { AzureAccount } from "../types";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchStageReport: vi.fn(),
    fetchArtifactZip: vi.fn(),
    triggerWorkflow: vi.fn(),
    deployZipToFunctionApp: vi.fn(),
    fetchDeployedBackend: vi.fn(),
    findFunctionAppGroup: vi.fn(),
    updateFunctionAppSettings: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  fetchStageReport: mocks.fetchStageReport,
  fetchArtifactZip: mocks.fetchArtifactZip,
  triggerWorkflow: mocks.triggerWorkflow,
}));

vi.mock("../api/azureArm", () => ({
  deployZipToFunctionApp: mocks.deployZipToFunctionApp,
  fetchDeployedBackend: mocks.fetchDeployedBackend,
  findFunctionAppGroup: mocks.findFunctionAppGroup,
  updateFunctionAppSettings: mocks.updateFunctionAppSettings,
}));

const build = { version: "version-2", sha: "123456789", runId: "12", artifactId: 4, builtAt: 20 };
const props = {
  azureAccount: { tenantId: "tenant-1" } as AzureAccount,
  subscriptionId: "sub-1",
  githubAccount: { id: 1, login: "org", type: "User" as const },
  repoName: "repo",
  selectedEnv: { name: "main", id: 1, url: "" },
  variableValues: {},
};

// These hook tests protect the card's status contract, especially separating a failed run from the last successful artifact.
async function mount() {
  let current: UseBackendDeployCard | null = null;
  function Harness() {
    const value = useBackendDeployCard(props);
    useEffect(() => { current = value; }, [value]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => { root.render(<Harness />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { root, current: () => current! };
}

describe("useBackendDeployCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: build, createdAt: 20_000 } : null
    );
    mocks.fetchDeployedBackend.mockResolvedValue({ version: "version-1", sha: "abcdefg" });
    mocks.findFunctionAppGroup.mockResolvedValue("group");
    mocks.triggerWorkflow.mockResolvedValue(undefined);
  });

  afterEach(() => { vi.useRealTimers(); });

  it("shows the deployment action and reports deployment errors", async () => {
    const hook = await mount();
    expect(hook.current().status).toBe("warning");
    expect(hook.current().summary).toBe("Ready to deploy the new build");

    mocks.fetchArtifactZip.mockRejectedValueOnce(new Error("Download failed"));
    await act(async () => { await hook.current().run(); });
    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Deployment error");
    expect(hook.current().error).toBe("Download failed");
    await act(async () => { hook.root.unmount(); });
  });

  it("reports an error when the deployed version cannot be read", async () => {
    mocks.fetchDeployedBackend.mockRejectedValueOnce(new Error("Azure unavailable"));
    const hook = await mount();
    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Deployment error");
    expect(hook.current().error).toBe("Azure unavailable");
    await act(async () => { hook.root.unmount(); });
  });

  it("asks for a build when no artifact exists", async () => {
    mocks.fetchStageReport.mockResolvedValue(null);
    const hook = await mount();
    expect(hook.current().status).toBe("warning");
    expect(hook.current().summary).toBe("Build the backend");
    await act(async () => { hook.root.unmount(); });
  });

  it("reports a build error when the package artifact is missing", async () => {
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: { ...build, artifactId: null }, createdAt: 20_000 } : null
    );
    const hook = await mount();
    await act(async () => { await hook.current().run(); });
    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Build error");
    await act(async () => { hook.root.unmount(); });
  });

  it("recognizes a newer failed build and keeps the previous artifact", async () => {
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: build, createdAt: 20_000 } : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    const hook = await mount();
    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Build error");
    expect(hook.current().failedBuildRunId).toBe("13");
    expect(hook.current().latest).toEqual(build);
    await act(async () => { hook.root.unmount(); });
  });

  it("uses run IDs to distinguish build reports from the same second", async () => {
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: build, createdAt: 20_000 } : { stage: { runId: "13" }, createdAt: 20_000 }
    );
    const hook = await mount();
    expect(hook.current().summary).toBe("Build error");
    expect(hook.current().failedBuildRunId).toBe("13");
    await act(async () => { hook.root.unmount(); });
  });

  it("does not report an older failed build after a successful build", async () => {
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: build, createdAt: 20_000 } : { stage: { runId: "11" }, createdAt: 20_000 }
    );
    const hook = await mount();
    expect(hook.current().status).toBe("warning");
    expect(hook.current().summary).toBe("Ready to deploy the new build");
    await act(async () => { hook.root.unmount(); });
  });

  it("reports a failed build while polling and clears it on a successful retry", async () => {
    const hook = await mount();
    vi.useFakeTimers();
    let task: Promise<void>;
    await act(async () => { task = hook.current().build(); });
    expect(hook.current().summary).toBe("Building backend");
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: build, createdAt: 20_000 } : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); await task; });
    expect(hook.current().status).toBe("error");
    expect(hook.current().failedBuildRunId).toBe("13");

    await act(async () => { task = hook.current().build(); });
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: { ...build, builtAt: 40, runId: "14" }, createdAt: 40_000 } : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); await task; });
    expect(hook.current().status).toBe("warning");
    expect(hook.current().summary).toBe("Ready to deploy the new build");
    expect(hook.current().failedBuildRunId).toBeNull();
    await act(async () => { hook.root.unmount(); });
  });

  it("detects a new failed run with the same timestamp as the previous failure", async () => {
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: build, createdAt: 20_000 } : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    const hook = await mount();
    vi.useFakeTimers();
    let task: Promise<void>;
    await act(async () => { task = hook.current().build(); });
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "backend" ? { stage: build, createdAt: 20_000 } : { stage: { runId: "14" }, createdAt: 30_000 }
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); await task; });
    expect(hook.current().status).toBe("error");
    expect(hook.current().failedBuildRunId).toBe("14");
    await act(async () => { hook.root.unmount(); });
  });

  it("shows a completed deployment when the live version matches", async () => {
    mocks.fetchDeployedBackend.mockResolvedValue({ version: build.version, sha: build.sha });
    const hook = await mount();
    expect(hook.current().status).toBe("complete");
    expect(hook.current().summary).toBe("Deployed 1234567");
    await act(async () => { hook.root.unmount(); });
  });

  it("shows a build error when starting the workflow fails", async () => {
    const hook = await mount();
    mocks.triggerWorkflow.mockRejectedValueOnce(new Error("Dispatch failed"));
    await act(async () => { await hook.current().build(); });
    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Build error");
    expect(hook.current().error).toBe("Dispatch failed");
    await act(async () => { hook.root.unmount(); });
  });
});