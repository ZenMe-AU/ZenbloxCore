import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackendDeployCard from "../cards/BackendDeploy/BackendDeployCard";
import { useBackendDeployCard, type UseBackendDeployCard } from "../cards/BackendDeploy/useBackendDeployCard";
import type { AzureAccount } from "../types";
import theme from "../theme";

const mocks = vi.hoisted(() => ({
	access: {
		status: "error" as "idle" | "checking" | "error" | "ready",
		failureKind: "permission" as "permission" | "authentication" | "request" | null,
		error: "Missing Azure management permissions" as string | null,
		retry: vi.fn(),
		check: vi.fn(),
		reportFailure: vi.fn(),
	},
	fetchStageReport: vi.fn(),
	fetchArtifactZip: vi.fn(),
	triggerWorkflow: vi.fn(),
	deployZipToFunctionApp: vi.fn(),
	fetchDeployedBackend: vi.fn(),
	findFunctionAppGroup: vi.fn(),
	updateFunctionAppSettings: vi.fn(),
}));

vi.mock("../hooks/util/useAzureCardAccess", () => ({
	useCardResourceAccess: () => mocks.access,
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
const hookProps = {
	azureAccount: { tenantId: "tenant-1" } as AzureAccount,
	subscriptionId: "sub-1",
	githubAccount: { id: 1, login: "org", type: "User" as const },
	repoName: "repo",
	selectedEnv: { name: "main", id: 1, url: "" },
	variableValues: {},
};

async function mount() {
	let current: UseBackendDeployCard | null = null;
	function Harness() {
		const value = useBackendDeployCard(hookProps);
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
		mocks.access.status = "ready";
		mocks.access.error = null;
		mocks.access.failureKind = null;
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

	it.each([
		{ kind: "permission" as const, status: "warning", summary: "Insufficient permissions to deploy" },
		{ kind: "authentication" as const, status: "warning", summary: "Sign in again to check deployment access" },
		{ kind: "request" as const, status: "error", summary: "Unable to verify deployment access" },
	])("uses $status for $kind access failures even when already deployed", async ({ kind, status, summary }) => {
		mocks.access.status = "error";
		mocks.access.failureKind = kind;
		mocks.access.error = "Access details";
		mocks.fetchDeployedBackend.mockResolvedValue({ version: build.version, sha: build.sha });
		const hook = await mount();
		expect(hook.current()).toMatchObject({ status, summary, showReady: false, showCurrent: false });
		await act(async () => hook.root.unmount());
	});

	it.each(["idle", "checking"] as const)("does not claim readiness when access is %s", async (status) => {
		mocks.access.status = status;
		const hook = await mount();
		expect(hook.current()).toMatchObject({ status: "loading", summary: "Checking deployment access", showReady: false, showCurrent: false });
		await act(async () => hook.root.unmount());
	});

	it("keeps a build failure red when permission is also missing", async () => {
		mocks.access.status = "error";
		mocks.access.failureKind = "permission";
		const hook = await mount();
		mocks.triggerWorkflow.mockRejectedValueOnce(new Error("Dispatch failed"));
		await act(async () => hook.current().build());
		expect(hook.current()).toMatchObject({ status: "error", summary: "Build error", showReady: false });
		await act(async () => hook.root.unmount());
	});

	it("keeps an actual denied deployment red and reports the access failure", async () => {
		const hook = await mount();
		const denied = new Error("403 /subscriptions/sub-1: Forbidden");
		mocks.fetchArtifactZip.mockRejectedValueOnce(denied);
		await act(async () => hook.current().run());
		expect(hook.current()).toMatchObject({ status: "error", summary: "Deployment error", showReady: false });
		expect(mocks.access.reportFailure).toHaveBeenCalledWith(denied);
		await act(async () => hook.root.unmount());
	});
});

describe("backend deploy permission errors", () => {
	it("shows a separate prerequisites section below Deploy and restores status after a recheck", async () => {
		mocks.access.status = "error";
		mocks.access.failureKind = "permission";
		mocks.access.error = "Missing Azure management permissions";
		mocks.access.retry.mockReset();
		mocks.fetchStageReport.mockResolvedValue({
			stage: { version: "2", sha: "abcdef123", runId: "123", artifactId: 1, builtAt: 1 },
		});
		mocks.fetchDeployedBackend.mockResolvedValue(null);
		mocks.findFunctionAppGroup.mockResolvedValue(null);
		const container = document.createElement("div");
		const root = createRoot(container);
		const props = {
			azureAccount: { tenantId: "tenant-1" } as AzureAccount,
			subscriptionId: "sub-1",
			githubAccount: { login: "example", id: 1, type: "Organization" as const },
			repoName: "corp",
			selectedEnv: { name: "TEST", id: 1, url: "" },
			variableValues: {},
		};

		function Harness() {
			const backend = useBackendDeployCard(props);
			return (
				<ThemeProvider theme={theme}>
					<BackendDeployCard
						card={{
							cardId: "backend_deploy", status: backend.status, summary: backend.summary,
							locked: false, requirements: [], unavailable: false, expanded: true,
							onToggle: vi.fn(), onRequirementClick: vi.fn(),
						}}
						backend={backend}
						repoFullName="example/corp"
					/>
				</ThemeProvider>
			);
		}

		try {
			await act(async () => root.render(<Harness />));
			expect(Array.from(container.querySelectorAll('[role="alert"]')).some((alert) => alert.textContent?.includes("Insufficient permissions to deploy"))).toBe(true);
			expect(container.textContent).not.toContain("Ready to deploy the new build");
			const deploy = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Deploy")!;
			expect(container.querySelector('[data-testid="ErrorOutlineIcon"]')).toBeNull();
			expect(container.querySelector('[data-testid="WarningAmberIcon"]')).not.toBeNull();
			const buildButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Build")!;
			expect(deploy.disabled).toBe(true);
			expect(buildButton.disabled).toBe(false);
			expect(deploy.parentElement?.textContent).toContain("Insufficient permissions to deploy");
			const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="backend-deploy-prerequisites"]')!;
			expect(deploy.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			expect(toggle.querySelectorAll(".prerequisites-toggle-line")).toHaveLength(2);
			expect(toggle.getAttribute("aria-expanded")).toBe("false");
			await act(async () => toggle.click());
			expect(toggle.getAttribute("aria-expanded")).toBe("true");
			const prerequisites = container.querySelector("#backend-deploy-prerequisites")!;
			expect(prerequisites.textContent).toContain("Missing Azure management permissions");
			const retry = Array.from(prerequisites.querySelectorAll("button")).find((button) => button.textContent === "Recheck resource access")!;
			await act(async () => retry.click());
			expect(mocks.access.retry).toHaveBeenCalledOnce();
			mocks.access.status = "ready";
			mocks.access.error = null;
			mocks.access.failureKind = null;
			await act(async () => root.render(<Harness />));
			expect(Array.from(container.querySelectorAll('[role="status"]')).some((status) => status.textContent?.includes("Ready to deploy the new build"))).toBe(true);
			expect(deploy.disabled).toBe(false);
			expect(container.querySelector('[aria-controls="backend-deploy-prerequisites"]')).toBeNull();
			mocks.access.status = "error";
			mocks.access.error = "Missing Azure management permissions";
			mocks.access.failureKind = "permission";
			await act(async () => root.render(<Harness />));
			expect(container.textContent).not.toContain("Ready to deploy the new build");
			const restoredToggle = container.querySelector<HTMLButtonElement>('[aria-controls="backend-deploy-prerequisites"]')!;
			expect(restoredToggle.getAttribute("aria-expanded")).toBe("true");
			await act(async () => restoredToggle.click());
			expect(restoredToggle.getAttribute("aria-expanded")).toBe("false");
		} finally {
			await act(async () => root.unmount());
		}
	});
});
