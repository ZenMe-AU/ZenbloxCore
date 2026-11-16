import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebDeployCard, type UseWebDeployCard } from "../cards/WebDeploy/useWebDeployCard";
import type { AzureAccount } from "../types";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchArtifactZip: vi.fn(),
    fetchStageReport: vi.fn(),
    triggerWorkflow: vi.fn(),
    getStaticWebsiteUrl: vi.fn(),
    readDeployedSite: vi.fn(),
    recordDeployedSite: vi.fn(),
    uploadStaticSite: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  fetchArtifactZip: mocks.fetchArtifactZip,
  fetchStageReport: mocks.fetchStageReport,
  triggerWorkflow: mocks.triggerWorkflow,
}));

vi.mock("../api/azureArm", () => ({ getStaticWebsiteUrl: mocks.getStaticWebsiteUrl }));

vi.mock("../api/azureBlob", () => ({
  readDeployedSite: mocks.readDeployedSite,
  recordDeployedSite: mocks.recordDeployedSite,
  uploadStaticSite: mocks.uploadStaticSite,
}));

vi.mock("../logic/naming", () => ({ getWebStorageAccountName: () => "sitestorage" }));

const latestBuild = { version: "version-2", sha: "123456789", runId: "12", artifactId: 4, builtAt: 20 };
const props = {
  azureAccount: { tenantId: "tenant-1" } as AzureAccount,
  subscriptionId: "sub-1",
  githubAccount: { id: 1, login: "org", type: "User" as const },
  repoName: "repo",
  selectedEnv: { name: "main", id: 1, url: "" },
  variableValues: { VITE_GITHUB_CLIENT_ID: "client-id" },
};

async function mount() {
  let current: UseWebDeployCard | null = null;
  function Harness() {
    const value = useWebDeployCard(props);
    useEffect(() => { current = value; }, [value]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => { root.render(<Harness />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { root, current: () => current! };
}

// Guard the frontend card's build/deploy status contract, including recovery after a failed build.
describe("useWebDeployCard status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "frontend" ? { stage: latestBuild, createdAt: 20_000 } : null
    );
    mocks.getStaticWebsiteUrl.mockResolvedValue(null);
    mocks.readDeployedSite.mockResolvedValue(null);
    mocks.triggerWorkflow.mockResolvedValue(undefined);
  });

  afterEach(() => { vi.useRealTimers(); });

  it("shows a loading header while the frontend build runs, then a red build error on failure", async () => {
    const hook = await mount();
    let rejectDispatch!: (reason: Error) => void;
    mocks.triggerWorkflow.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectDispatch = reject; }));

    let task!: Promise<void>;
    await act(async () => {
      task = hook.current().build();
      await Promise.resolve();
    });
    expect(hook.current().status).toBe("loading");
    expect(hook.current().summary).toBe("Building frontend");

    await act(async () => {
      rejectDispatch(new Error("Dispatch failed"));
      await task;
    });
    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Build error");
    expect(hook.current().error).toBe("Dispatch failed");
    await act(async () => { hook.root.unmount(); });
  });

  it("shows a deployment error status when publishing the built site fails", async () => {
    const hook = await mount();
    mocks.fetchArtifactZip.mockRejectedValueOnce(new Error("Download failed"));

    await act(async () => { await hook.current().run(); });

    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Deployment error");
    expect(hook.current().error).toBe("Download failed");
    await act(async () => { hook.root.unmount(); });
  });

  it("recognizes a newer failed build and keeps the previous artifact available", async () => {
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "frontend"
        ? { stage: latestBuild, createdAt: 20_000 }
        : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    const hook = await mount();

    expect(hook.current().status).toBe("error");
    expect(hook.current().summary).toBe("Build error");
    expect(hook.current().failedBuildRunId).toBe("13");
    expect(hook.current().latest).toEqual(latestBuild);
    await act(async () => { hook.root.unmount(); });
  });

  it("clears a failed build state when a later build succeeds", async () => {
    const hook = await mount();
    vi.useFakeTimers();
    let task: Promise<void>;

    await act(async () => { task = hook.current().build(); });
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "frontend"
        ? { stage: latestBuild, createdAt: 20_000 }
        : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); await task; });
    expect(hook.current().status).toBe("error");
    expect(hook.current().failedBuildRunId).toBe("13");

    await act(async () => { task = hook.current().build(); });
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "frontend"
        ? { stage: { ...latestBuild, runId: "14", builtAt: 40 }, createdAt: 40_000 }
        : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); await task; });

    expect(hook.current().status).toBe("warning");
    expect(hook.current().summary).toBe("Ready to deploy the new build");
    expect(hook.current().failedBuildRunId).toBeNull();
    await act(async () => { hook.root.unmount(); });
  });
});