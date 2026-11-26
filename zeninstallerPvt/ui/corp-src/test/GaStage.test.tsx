/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Account,
  AzureAccount,
  CardChrome,
  CardId,
  CardStatus,
  GhEnv,
  StageDefinition,
} from "../types";
import theme from "../theme";

const mocks = vi.hoisted(() => ({
  createVariable: vi.fn(),
  fetchLogArtifact: vi.fn(),
  fetchPlan: vi.fn(),
  updateVariable: vi.fn(),
  remoteStart: vi.fn(),
  remoteHook: vi.fn(),
}));

vi.mock("../api", () => ({
  createVariable: mocks.createVariable,
  fetchLogArtifact: mocks.fetchLogArtifact,
  fetchPlan: mocks.fetchPlan,
  updateVariable: mocks.updateVariable,
}));

vi.mock("../hooks/util/useAzurePermissions", () => ({
  useAzurePermissions: () => ({ ready: true, missing: [], error: null, granting: false, grant: vi.fn() }),
  useServicePrincipalId: () => ({ id: "plan-app-object-id", error: null }),
}));

vi.mock("../hooks/util/useAzureCardAccess", () => ({
  useCardResourceAccess: () => ({
    status: "ready",
    error: null,
    failureKind: null,
    retry: vi.fn(),
    check: vi.fn(),
    reportFailure: vi.fn(),
    missingRoles: null,
    missingEntra: null,
    unregisteredProviders: [],
    registeringProviders: false,
    registerProviders: vi.fn(),
    missingConsent: [],
    grantConsent: vi.fn(),
  }),
}));

vi.mock("../hooks/util/useProviderRegistration", () => ({
  useUnregisteredProviders: () => ({
    status: "ready",
    error: null,
    unregistered: [],
    registering: false,
    register: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock("../cards/GaStage/useRemoteTerminal", () => ({
  useRemoteTerminal: (options: unknown) => {
    mocks.remoteHook(options);
    return {
      start: mocks.remoteStart,
      stop: vi.fn(),
      terminal: null,
      resize: vi.fn(),
      status: "idle",
      runnerJoined: false,
      stage: null,
      sessionId: null,
      deviceCode: null,
      loggedIn: [],
      error: null,
    };
  },
}));

vi.mock("../cards/GaStage/RemoteTerminal", () => ({
  default: () => <div data-testid="ga-remote-terminal">Remote terminal</div>,
}));

import GaStage from "../cards/GaStage/GaStage";
import GaCloudFront from "../cards/GaCloudFront/GaCloudFront";
import { GA_CLOUDFRONT_CARD_ID } from "../cards/GaCloudFront/config";
import GaSubscriptionBudget from "../cards/GaSubscriptionBudget/GaSubscriptionBudget";
import { GA_SUBSCRIPTION_BUDGET_CARD_ID } from "../cards/GaSubscriptionBudget/config";
import StageCard from "../cards/Stage/StageCard";

const account = { id: 1, login: "owner", type: "Organization" } as Account;
const azureAccount = {
  homeAccountId: "home",
  environment: "login.microsoftonline.com",
  tenantId: "tenant",
  localAccountId: "local",
  username: "user@example.com",
} as AzureAccount;
const selectedEnv = { id: 1, name: "PROD", url: "https://github.example/env" } as GhEnv;
const stageDef: StageDefinition = {
  dir: "SubscriptionBudget",
  label: "Azure subscription budget",
  description: "Sets a spending budget on the Azure subscription.",
  workflowId: "plan.yml",
  deployWorkflowId: "deploy.yml",
  prerequisites: [{ type: "stageVar", keys: ["CONTACT_EMAILS"], label: "Budget contacts" }],
  planPermissions: [],
};

type StageCardProps = React.ComponentProps<typeof GaStage>;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

function cardChrome(overrides: Partial<CardChrome> = {}): CardChrome {
  return {
    cardId: "stage_GA_SubscriptionBudget",
    status: "idle",
    summary: "Get updated plan",
    locked: false,
    requirements: [],
    unavailable: false,
    expanded: true,
    onToggle: vi.fn(),
    onRequirementClick: vi.fn(),
    ...overrides,
  };
}

function props(overrides: Partial<StageCardProps> = {}): StageCardProps {
  return {
    card: cardChrome(),
    stageDef,
    stage: { stage: stageDef.dir, status: "pending" },
    prerequisiteAssessment: {
      missing: ["CONTACT_EMAILS"],
      incomplete: [],
      changed: [],
      blocked: true,
      summary: "CONTACT_EMAILS not set",
    },
    latestSha: "latest",
    deployDisabled: true,
    deployedEnv: null,
    variableValues: {
      AZURE_SUBSCRIPTION_ID: "subscription",
      AZURE_TENANT_ID: "tenant",
      AZURE_PLAN_CLIENT_ID: "plan-client",
      TF_STATE_RESOURCE_GROUP: "state-rg",
      TF_STATE_STORAGE_ACCOUNT: "stateaccount",
    },
    cardStatus: {} as Record<CardId, CardStatus>,
    account,
    repoName: "repo",
    selectedEnv,
    onVariableConfirmed: vi.fn(),
    onPlanSummary: vi.fn(),
    onRunStatusUpdate: vi.fn(),
    statusUpdateRunning: false,
    statusUpdateCountdown: 0,
    statusUpdateDisabled: true,
    runError: null,
    azureAccount,
    operation: { state: "idle" },
    forcePlan: vi.fn(),
    forceDeploy: vi.fn(),
    forceIdle: vi.fn(),
    forceError: vi.fn(),
    ...overrides,
  };
}

async function renderStage(initialProps: StageCardProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let current = initialProps;
  const render = async (next = current) => {
    current = next;
    await act(async () => {
      root.render(
        <TestProviders>
          <GaStage {...next} />
        </TestProviders>
      );
      await Promise.resolve();
    });
  };
  await render();
  return { container, root, render };
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(name));
}

describe("GaStage parity baseline", () => {
  let root: Root | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    mocks.fetchPlan.mockResolvedValue({ resource_changes: [] });
    mocks.fetchLogArtifact.mockResolvedValue("failure output");
    mocks.remoteStart.mockResolvedValue(true);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
  });

  it("mounts independently beside the legacy card", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const legacyToggle = vi.fn();
    const gaToggle = vi.fn();
    const legacyProps = props({
      card: cardChrome({ cardId: "stage_SubscriptionBudget", onToggle: legacyToggle }),
    });
    const gaProps = props({ card: cardChrome({ onToggle: gaToggle }) });

    await act(async () => {
      root!.render(
        <TestProviders>
          <StageCard {...legacyProps} trackDeploy={undefined} />
          <GaStage {...gaProps} />
        </TestProviders>
      );
    });

    expect(container.querySelector("#card-stage_SubscriptionBudget")).not.toBeNull();
    expect(container.querySelector("#card-stage_GA_SubscriptionBudget")).not.toBeNull();
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .filter((button) => button.textContent?.includes("Prerequisites"))
        .forEach((button) => button.click());
    });
    expect(container.querySelector("#variable-CONTACT_EMAILS")).not.toBeNull();
    expect(container.querySelector("#stage_GA_SubscriptionBudget-variable-CONTACT_EMAILS")).not.toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>("#card-title-stage_SubscriptionBudget button")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>("#card-title-stage_GA_SubscriptionBudget button")?.click());
    expect(legacyToggle).toHaveBeenCalledOnce();
    expect(gaToggle).toHaveBeenCalledOnce();
    expect(mocks.remoteHook).toHaveBeenCalledOnce();
  });

  it("keeps concrete card anchors and remote-terminal dispatch identities distinct", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestProviders>
          <GaSubscriptionBudget {...props({ card: cardChrome({ cardId: GA_SUBSCRIPTION_BUDGET_CARD_ID }) })} />
          <GaCloudFront {...props({ card: cardChrome({ cardId: GA_CLOUDFRONT_CARD_ID }) })} />
        </TestProviders>
      );
    });

    expect(container.querySelector(`#card-${GA_SUBSCRIPTION_BUDGET_CARD_ID}`)).not.toBeNull();
    expect(container.querySelector(`#card-${GA_CLOUDFRONT_CARD_ID}`)).not.toBeNull();
    expect(mocks.remoteHook).toHaveBeenNthCalledWith(1, expect.objectContaining({
      dir: "SubscriptionBudget",
      workflowId: "deploy.yml",
    }));
    expect(mocks.remoteHook).toHaveBeenNthCalledWith(2, expect.objectContaining({
      dir: "CloudFront",
      workflowId: "deploy.yml",
    }));
  });

  it("shows locked requirements and navigates independently of card expansion", async () => {
    const onRequirementClick = vi.fn();
    const onToggle = vi.fn();
    const rendered = await renderStage(props({
      card: cardChrome({
        locked: true,
        requirements: [{ label: "Repository & environment", target: "repo" }],
        onRequirementClick,
        onToggle,
      }),
    }));
    root = rendered.root;

    expect(rendered.container.textContent).toContain(stageDef.description);
    expect(rendered.container.textContent).toContain("Complete these setup steps first");
    expect(rendered.container.textContent).not.toContain("Update variables");

    const requirement = [...rendered.container.querySelectorAll<HTMLElement>(".req-label")]
      .find((element) => element.textContent === "Repository & environment");
    await act(async () => requirement?.closest("button")?.click());
    expect(onRequirementClick).toHaveBeenCalledWith("repo");

    await act(async () => rendered.container.querySelector<HTMLButtonElement>("#card-title-stage_GA_SubscriptionBudget button")?.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows stage-variable blockers and runs a prerequisite refresh when changed inputs are otherwise valid", async () => {
    const onRunStatusUpdate = vi.fn().mockResolvedValue(undefined);
    const onVariableConfirmed = vi.fn();
    const rendered = await renderStage(props({
      prerequisiteAssessment: {
        missing: [],
        incomplete: [],
        changed: ["CONTACT_EMAILS"],
        blocked: true,
        summary: "CONTACT_EMAILS changed since last plan",
      },
      deployedEnv: { CONTACT_EMAILS: "old@example.com" },
      variableValues: {
        ...props().variableValues,
        CONTACT_EMAILS: "new@example.com",
      },
      onVariableConfirmed,
      onRunStatusUpdate,
      statusUpdateDisabled: false,
    }));
    root = rendered.root;

    await act(async () => buttonNamed(rendered.container, "Prerequisites")?.click());
    expect(rendered.container.querySelector<HTMLInputElement>("#stage_GA_SubscriptionBudget-variable-CONTACT_EMAILS")?.value).toBe("new@example.com");
    await act(async () => buttonNamed(rendered.container, "Refresh plan")?.click());
    expect(onRunStatusUpdate).toHaveBeenCalledOnce();
  });

  it("updates an edited stage variable and confirms it with the owner", async () => {
    const onVariableConfirmed = vi.fn();
    const rendered = await renderStage(props({
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "old@example.com" },
      onVariableConfirmed,
    }));
    root = rendered.root;

    await act(async () => buttonNamed(rendered.container, "Prerequisites")?.click());
    const input = rendered.container.querySelector<HTMLInputElement>("#stage_GA_SubscriptionBudget-variable-CONTACT_EMAILS")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "new@example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => buttonNamed(rendered.container, "Update 1 variable")?.click());

    expect(mocks.updateVariable).toHaveBeenCalledWith(account, "repo", "CONTACT_EMAILS", "new@example.com", "PROD");
    expect(onVariableConfirmed).toHaveBeenCalledWith("CONTACT_EMAILS", "new@example.com");
  });

  it("shows an active plan run and disables duplicate refreshes", async () => {
    const onRunStatusUpdate = vi.fn();
    const rendered = await renderStage(props({
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "owner@example.com" },
      onRunStatusUpdate,
      statusUpdateRunning: true,
      statusUpdateCountdown: 30,
      statusUpdateDisabled: true,
    }));
    root = rendered.root;

    const button = buttonNamed(rendered.container, "Running...");
    expect(button?.disabled).toBe(true);
    expect(rendered.container.textContent).toContain("Running... 30s");
    await act(async () => button?.click());
    expect(onRunStatusUpdate).not.toHaveBeenCalled();
  });

  it("loads a successful plan, exposes deploy, and starts terminal tracking", async () => {
    const trackDeploy = vi.fn(async (start: (isCurrent: () => boolean) => Promise<boolean>) => { await start(() => true); });
    const onPlanSummary = vi.fn();
    const rendered = await renderStage(props({
      card: cardChrome({ status: "warning", summary: "Ready to deploy" }),
      stage: {
        stage: stageDef.dir,
        status: "success",
        runId: "plan-1",
        planJsonId: "artifact-1",
        planJsonUrl: "https://github.example/plan.json",
      },
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "owner@example.com" },
      deployDisabled: false,
      trackDeploy,
      onPlanSummary,
      statusUpdateDisabled: false,
    }));
    root = rendered.root;

    expect(mocks.fetchPlan).toHaveBeenCalledWith("artifact-1", account, "repo");
    await expect.poll(() => onPlanSummary).toHaveBeenCalledWith({ create: 0, update: 0, delete: 0, replace: 0 });
    await expect.poll(() => rendered.container.textContent).toContain("No changes detected.");

    await act(async () => [...rendered.container.querySelectorAll("button")].find((button) => button.textContent === "Deploy")?.click());
    expect(mocks.remoteStart).toHaveBeenCalledOnce();
    expect(trackDeploy).toHaveBeenCalledOnce();
  });

  it("offers operation controls on a locked card without a description", async () => {
    const forcePlan = vi.fn();
    const forceDeploy = vi.fn();
    const forceIdle = vi.fn();
    const forceError = vi.fn();
    const rendered = await renderStage(props({
      stageDef: { ...stageDef, description: undefined },
      card: cardChrome({ locked: true, requirements: [{ label: "Repository", target: "repo" }] }),
      operation: { state: "error", kind: "plan", error: "forced" },
      forcePlan,
      forceDeploy,
      forceIdle,
      forceError,
    }));
    root = rendered.root;
    expect(rendered.container.textContent).toContain("Operation: plan error");
    const controls = rendered.container.querySelector('[aria-label="Operation state controls"]')!;
    const buttons = [...controls.querySelectorAll("button")];
    await act(async () => {
      buttons.forEach((button) => button.click());
    });
    expect(forceIdle).toHaveBeenCalledOnce();
    expect(forcePlan).toHaveBeenCalledOnce();
    expect(forceDeploy).toHaveBeenCalledWith(mocks.remoteStart);
    expect(forceError.mock.calls).toEqual([["plan"], ["deploy"]]);
    expect(rendered.container.querySelectorAll('[data-testid="ga-remote-terminal"]')).toHaveLength(1);
  });

  it("renders one remote terminal per card", async () => {
    const rendered = await renderStage(props({
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "owner@example.com" },
    }));
    root = rendered.root;

    expect(rendered.container.querySelectorAll('[data-testid="ga-remote-terminal"]')).toHaveLength(1);
  });

  it("loads and reveals failed plan output and completed deployment output", async () => {
    const planFailure = await renderStage(props({
      stage: {
        stage: stageDef.dir,
        status: "failed",
        planLogId: 42,
      },
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "owner@example.com" },
    }));
    root = planFailure.root;
    expect(mocks.fetchLogArtifact).toHaveBeenCalledWith(account, "repo", 42);
    await act(async () => buttonNamed(planFailure.container, "view result")?.click());
    expect(planFailure.container.textContent).toContain("failure output");
    await act(async () => planFailure.root.unmount());
    root = undefined;

    const deployFailure = await renderStage(props({
      stage: {
        stage: stageDef.dir,
        status: "success",
        runId: "plan-2",
        deployStatus: "failed",
        deployRunId: "deploy-2",
        deployLogId: 43,
        deployedAt: 1,
      },
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "owner@example.com" },
    }));
    root = deployFailure.root;
    expect(mocks.fetchLogArtifact).toHaveBeenCalledWith(account, "repo", 43);
    expect(deployFailure.container.textContent).toContain("Last Deploy");
    await expect.poll(() => deployFailure.container.textContent).toContain("failure output");
  });

  it("shows completed and cancelled deployment outcomes", async () => {
    const completed = await renderStage(props({
      stage: {
        stage: stageDef.dir,
        status: "success",
        runId: "plan-complete",
        deployStatus: "success",
        deployRunId: "deploy-complete",
        deployedAt: 1,
      },
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "owner@example.com" },
    }));
    root = completed.root;
    expect(completed.container.textContent).toContain("Last Deploy");
    expect(completed.container.textContent).toContain("Open deployment run in GitHub");
    expect(completed.container.textContent).not.toContain("Cancelled");
    await act(async () => completed.root.unmount());
    root = undefined;

    const cancelled = await renderStage(props({
      stage: {
        stage: stageDef.dir,
        status: "success",
        runId: "plan-cancelled",
        deployStatus: "cancelled",
        deployRunId: "deploy-cancelled",
        deployedAt: 1,
      },
      prerequisiteAssessment: { missing: [], incomplete: [], changed: [], blocked: false, summary: "" },
      variableValues: { ...props().variableValues, CONTACT_EMAILS: "owner@example.com" },
    }));
    root = cancelled.root;
    expect(cancelled.container.textContent).toContain("Cancelled");
  });
});
