import { act, useEffect, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Card from "../components/Card";
import { WebDeploySection } from "../cards/PrivateZeninstaller/PrivateZeninstallerCard";
import { useWebDeployCard, type UseWebDeployCard } from "../cards/PrivateZeninstaller/usePrivateZeninstallerCard";
import type { AzureAccount } from "../types";
import theme from "../theme";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    access: {
      status: "ready" as "idle" | "checking" | "ready" | "error",
      error: null as string | null,
      failureKind: null as "permission" | "authentication" | "request" | null,
      retry: vi.fn(), check: vi.fn(), reportFailure: vi.fn(),
      missingRoles: null, missingEntra: null, unregisteredProviders: [] as string[], registeringProviders: false, registerProviders: async () => {}, missingConsent: [] as string[], grantConsent: vi.fn(),
    },
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

vi.mock("../logic/naming", () => ({ getWebStorageAccountName: () => "sitestorage", PRIVATE_RESOURCE_GROUP: "private-rg" }));
vi.mock("../hooks/util/useAzureCardAccess", () => ({ useCardResourceAccess: () => mocks.access }));
vi.mock("../cards/CloudVariableDetail", () => ({ default: () => null }));

const latestBuild = { version: "version-2", sha: "123456789", runId: "12", artifactId: 4, builtAt: 20 };
const props = {
  azureAccount: { tenantId: "tenant-1" } as AzureAccount,
  subscriptionId: "sub-1",
  githubAccount: { id: 1, login: "org", type: "User" as const },
  repoName: "repo",
  selectedEnv: { name: "main", id: 1, url: "" },
  variableValues: { VITE_GITHUB_CLIENT_ID: "client-id" },
  storageAccountName: "sitestorage",
  managementAccess: mocks.access,
};

async function mount(params = props) {
  let current: UseWebDeployCard | null = null;
  function Harness() {
    const value = useWebDeployCard(params);
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
    mocks.access.status = "ready";
    mocks.access.error = null;
    mocks.access.failureKind = null;
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

  it.each([
    { kind: "permission" as const, status: "warning", summary: "Insufficient permissions to deploy" },
    { kind: "authentication" as const, status: "warning", summary: "Sign in again to check deployment access" },
    { kind: "request" as const, status: "error", summary: "Unable to verify deployment access" },
  ])("uses $status for $kind access failures instead of claiming completion", async ({ kind, status, summary }) => {
    mocks.access.status = "error";
    mocks.access.failureKind = kind;
    mocks.access.error = "Access details";
    mocks.readDeployedSite.mockResolvedValue({ version: latestBuild.version, sha: latestBuild.sha });
    mocks.getStaticWebsiteUrl.mockResolvedValue("https://site.example.com");
    const hook = await mount();
    expect(hook.current()).toMatchObject({ status, summary, showReady: false, showCurrent: false });
    await act(async () => hook.root.unmount());
  });

  it.each(["idle", "checking"] as const)("waits for deployment access when it is %s", async (status) => {
    mocks.access.status = status;
    const hook = await mount();
    expect(hook.current()).toMatchObject({ status: "loading", summary: "Checking deployment access", showReady: false, showCurrent: false });
    await act(async () => hook.root.unmount());
  });

  it("treats a missing client ID as an input warning and blocks deployment", async () => {
    const hook = await mount({ ...props, variableValues: { VITE_GITHUB_CLIENT_ID: "" } });
    expect(hook.current()).toMatchObject({ status: "warning", summary: "VITE_GITHUB_CLIENT_ID not set", showReady: false, showCurrent: false });
    await act(async () => hook.current().run());
    expect(mocks.fetchArtifactZip).not.toHaveBeenCalled();
    await act(async () => hook.root.unmount());
  });

  it("does not hide an actual build failure behind missing input or permission", async () => {
    mocks.access.status = "error";
    mocks.access.failureKind = "permission";
    mocks.fetchStageReport.mockImplementation(async (_account, _repo, _env, dir) =>
      dir === "frontend" ? { stage: latestBuild, createdAt: 20_000 } : { stage: { runId: "13" }, createdAt: 30_000 }
    );
    const hook = await mount({ ...props, variableValues: { VITE_GITHUB_CLIENT_ID: "" } });
    expect(hook.current()).toMatchObject({ status: "error", summary: "Build error", showReady: false });
    await act(async () => hook.root.unmount());
  });

  it("shows green completion only when version and prerequisites are current", async () => {
    mocks.getStaticWebsiteUrl.mockResolvedValue("https://site.example.com");
    mocks.readDeployedSite.mockResolvedValue({ version: latestBuild.version, sha: latestBuild.sha });
    const hook = await mount();
    expect(hook.current()).toMatchObject({ status: "complete", summary: "Deployed 1234567", showReady: false, showCurrent: true });
    await act(async () => hook.root.unmount());
  });

  it("updates rendered readiness and severity when access changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    function Harness() {
      const web = useWebDeployCard(props);
      return <ThemeProvider theme={theme}>
        {/* A plain card header stands in for the section header, which shows the frontend's status. */}
        <Card title="Frontend" cardId="web_deploy" status={web.status} summary={web.summary} locked={false} requirements={[]} unavailable={false} expanded onToggle={vi.fn()} onRequirementClick={vi.fn()}>
          <WebDeploySection
            web={web} storageAccountName={props.storageAccountName} managementAccess={props.managementAccess} githubAccount={props.githubAccount} repoName={props.repoName} selectedEnv={props.selectedEnv}
            variables={{} as ComponentProps<typeof WebDeploySection>["variables"]}
          />
        </Card>
      </ThemeProvider>;
    }
    try {
      mocks.access.status = "error";
      mocks.access.failureKind = "permission";
      mocks.access.error = "Activate the required role";
      await act(async () => root.render(<Harness />));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(container.textContent).toContain("Insufficient permissions to deploy");
      expect(container.textContent).not.toContain("Ready to deploy the new build");
      expect(container.querySelector('[data-testid="ErrorOutlineIcon"]')).toBeNull();
      const deploy = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Deploy")!;
      expect(deploy.disabled).toBe(true);
      mocks.access.status = "ready";
      mocks.access.error = null;
      mocks.access.failureKind = null;
      await act(async () => root.render(<Harness />));
      expect(container.textContent).toContain("Ready to deploy the new build");
      expect(deploy.disabled).toBe(false);
      mocks.access.status = "error";
      mocks.access.failureKind = "request";
      mocks.access.error = "Network unavailable";
      await act(async () => root.render(<Harness />));
      expect(container.textContent).toContain("Unable to verify deployment access");
      expect(container.textContent).not.toContain("Ready to deploy the new build");
      expect(container.querySelector('[data-testid="ErrorOutlineIcon"]')).not.toBeNull();
      expect(deploy.disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
    }
  });
});