/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import BackendDeployCard from "../cards/BackendDeploy/BackendDeployCard";
import { useBackendDeployCard } from "../cards/BackendDeploy/useBackendDeployCard";
import type { AzureAccount } from "../types";
import theme from "../theme";

const mocks = vi.hoisted(() => ({
  access: {
    status: "error" as "error" | "ready",
    error: "Missing Azure management permissions" as string | null,
    retry: vi.fn(),
    check: vi.fn(),
    reportFailure: vi.fn(),
  },
}));

vi.mock("../hooks/util/useCardResourceAccess", () => ({
  useCardResourceAccess: () => mocks.access,
}));

vi.mock("../api", () => ({
  fetchArtifactZip: vi.fn(),
  fetchStageReport: vi.fn().mockResolvedValue({
    stage: { version: "2", sha: "abcdef123", runId: "123", artifactId: 1, builtAt: 1 },
  }),
  triggerWorkflow: vi.fn(),
}));

vi.mock("../api/azureArm", () => ({
  deployZipToFunctionApp: vi.fn(),
  fetchDeployedBackend: vi.fn().mockResolvedValue(null),
  findFunctionAppGroup: vi.fn().mockResolvedValue(null),
  updateFunctionAppSettings: vi.fn(),
}));

describe("backend deploy permission errors", () => {
  it("shows a separate prerequisites section below Deploy and restores status after a recheck", async () => {
    mocks.access.status = "error";
    mocks.access.error = "Missing Azure management permissions";
    mocks.access.retry.mockReset();
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
      expect(container.querySelector('[title="Insufficient permissions to deploy"]')).not.toBeNull();
      const deploy = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Deploy")!;
      const build = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Build")!;
      expect(deploy.disabled).toBe(true);
      expect(build.disabled).toBe(false);
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
      await act(async () => root.render(<Harness />));
      expect(container.querySelector('[title="Update available"]')).not.toBeNull();
      expect(deploy.disabled).toBe(false);
      expect(container.querySelector('[aria-controls="backend-deploy-prerequisites"]')).toBeNull();
      mocks.access.status = "error";
      mocks.access.error = "Missing Azure management permissions";
      await act(async () => root.render(<Harness />));
      const restoredToggle = container.querySelector<HTMLButtonElement>('[aria-controls="backend-deploy-prerequisites"]')!;
      expect(restoredToggle.getAttribute("aria-expanded")).toBe("true");
      await act(async () => restoredToggle.click());
      expect(restoredToggle.getAttribute("aria-expanded")).toBe("false");
    } finally {
      await act(async () => root.unmount());
    }
  });
});
