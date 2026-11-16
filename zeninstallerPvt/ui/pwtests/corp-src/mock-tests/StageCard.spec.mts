/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/Stage/StageCard.tsx (all six mounted pipeline stages)
import { expect, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import JSZip from "jszip";
import { test, getViewportName } from "../../../../../.playwright/viewportFixture.mjs";
import { expectSnapshot } from "../../../../../.playwright/testHelper.js";
import { GITHUB_API_URL, MICROSOFT_GRAPH_URL } from "../../testInit.js";
import { prepareCardMocks, replyJson } from "../util/mockCardSetup.mts";

const stages = [
  { dir: "SubscriptionBudget", snapshotDir: "c01subscription", title: "Azure subscription budget" },
  { dir: "GlobalGroups", snapshotDir: "c02globalGroups", title: "Organisation security groups" },
  { dir: "UserAccounts", snapshotDir: "c07userAccounts", title: "User accounts and sign-in" },
  { dir: "AwsEntraSso", snapshotDir: "c20awsentrasso", title: "AWS single sign-on with Entra ID" },
  { dir: "AwsEntraSsoP2", snapshotDir: "c21awsentrassoP2", title: "AWS single sign-on with Entra ID P2" },
  { dir: "CloudFront", snapshotDir: "c25cloudfront", title: "AWS CloudFront distribution" },
];

for (const stage of stages) {
  test(`Happy path: ${stage.snapshotDir}`, async ({ page, context }, testInfo) => {
    await runHappyPath(page, context, testInfo, stage);
  });

  test(`Reports a workflow permission failure: ${stage.snapshotDir}`, async ({ page, context }, testInfo) => {
    const { card, state, unexpectedRequests } = await prepareStage(page, context, stage, { denyDispatch: true });
    await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
    await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
    await expect(card.getByRole("alert").filter({ hasText: /^Failed to trigger workflow$/ })).toBeVisible();
    await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
    expect(state.dispatches).toBe(1);
    expect(state.downloads).toBe(0);
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, `${stage.snapshotDir}-dispatch-denied`, getViewportName(testInfo));
  });
  test(`Groups prerequisites in one dropdown: ${stage.snapshotDir}`, async ({ page, context }, testInfo) => {
    const setup = await prepareCardMocks(page, context);
    const card = await setup.open(`stage_${stage.dir}`);
    const toggle = card.locator(`button[aria-controls="${stage.dir}-prerequisites"]`);
    const prerequisites = card.getByRole("region", { name: "Prerequisites" });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName("open prerequisites");
    await expect(prerequisites).toHaveCount(0);
    await expectSnapshot(page, card, testInfo, `${stage.snapshotDir}-start`, getViewportName(testInfo));
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAccessibleName("collapse");
    await expect(prerequisites).toBeVisible();
    await expect(prerequisites.getByText("COMPANY_SHORT_CODE: pwtests", { exact: true })).toBeVisible();
    await expect(prerequisites.getByText("Azure variables configured", { exact: true })).toHaveCount(0);
    await expect(prerequisites.getByText("c01 variables configured", { exact: true })).toHaveCount(0);
    for (const [key, value] of Object.entries({
      AZURE_CLIENT_ID: "00000000-0000-0000-0000-000000000002",
      AZURE_PLAN_CLIENT_ID: "00000000-0000-0000-0000-000000000002",
      AZURE_SUBSCRIPTION_ID: "mock-subscription",
      AZURE_TENANT_ID: "00000000-0000-0000-0000-000000000001",
    })) {
      await expect(prerequisites.getByText(`${key}: ${value}`, { exact: true })).toBeVisible();
    }
    if (stage.dir === "SubscriptionBudget") {
      await expect(prerequisites.getByText("CONTACT_EMAILS configured", { exact: true })).toHaveCount(0);
      await expect(prerequisites.getByLabel("CONTACT_EMAILS:")).toHaveValue("owner@example.com");
    }
    if (["AwsEntraSsoP2", "CloudFront"].includes(stage.dir)) {
      await expect(prerequisites.getByText("AWS variables configured", { exact: true })).toHaveCount(0);
      await expect(prerequisites.getByText("AWS_ROLE_ARN: arn:aws:iam::123456789012:role/zeninstaller-github", { exact: true })).toBeVisible();
    }
    if (!["SubscriptionBudget", "GlobalGroups"].includes(stage.dir)) {
      await expect(prerequisites.getByText("DNS Domain: pwtests.example.com", { exact: true })).toBeVisible();
    }
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(prerequisites).toHaveCount(0);
  });
}

// A whitespace-only required value must hide plan controls until the user supplies a valid value.
test("Hides plan controls until prerequisites are met", async ({ page, context }) => {
  const setup = await prepareCardMocks(page, context, { CONTACT_EMAILS: "   " });
  const zip = await new JSZip().file("plan.log", "Mock plan failure output").generateAsync({ type: "nodebuffer" });
  await page.route(`${GITHUB_API_URL}/**/deployments?*`, (route) => {
    const task = new URL(route.request().url()).searchParams.get("task");
    return replyJson(route, task === "plan:SubscriptionBudget" ? [{
      created_at: "2026-10-05T03:00:00Z",
      sha: "prod-mock-sha",
      payload: { stage: "SubscriptionBudget", status: "failed", runId: "mock-stage-run", planLogId: 1102 },
    }] : task === "deploy:SubscriptionBudget" ? [{
      created_at: "2026-10-04T03:00:00Z",
      payload: { deployStatus: "success", deployedAt: 1791082800, deployRunId: "previous-deployment" },
    }] : []);
  });
  await page.route(`${GITHUB_API_URL}/**/actions/artifacts/1102/zip`, (route) =>
    route.fulfill({ status: 200, contentType: "application/zip", body: zip })
  );

  const card = await setup.open("stage_SubscriptionBudget");
  const updatePlan = card.getByRole("button", { name: "Get Updated Plan", exact: true });
  const noPlan = card.getByText("No plan is available for this stage. Check the GitHub Actions run for errors, then create a new plan.");
  const result = card.locator('button[aria-controls="SubscriptionBudget-plan-output"]');
  await expect(card.getByText("CONTACT_EMAILS not set", { exact: true })).toBeVisible(); // Show the actionable blocker without a failure prefix.
  await expect(updatePlan).toHaveCount(0);
  await expect(noPlan).toHaveCount(0);
  await expect(result).toHaveCount(0);
  await expect(card.getByRole("region", { name: "Plan output" })).toHaveCount(0);
  await expect(card.getByRole("region", { name: "Plan", exact: true })).toHaveCount(0);
  await expect(card.getByText("Last Deploy", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: "Open deployment run in GitHub" })).toBeVisible();

  await card.getByRole("button", { name: "open prerequisites" }).click();
  const email = card.getByLabel("CONTACT_EMAILS:");
  await email.fill("owner@example.com");
  await card.getByRole("button", { name: "Update 1 variable" }).click();
  await expect(updatePlan).toBeEnabled();
  await expect(card.getByRole("region", { name: "Plan", exact: true })).toBeVisible();
  await expect(noPlan).toBeVisible();
  await expect(result).toBeVisible();
  await result.click();
  await expect(card.getByRole("region", { name: "Plan output" })).toContainText("Mock plan failure output");

  await email.fill("   ");
  await card.getByRole("button", { name: "Update 1 variable" }).click();
  await expect(updatePlan).toHaveCount(0);
  await expect(noPlan).toHaveCount(0);
  await expect(result).toHaveCount(0);
  await expect(card.getByRole("region", { name: "Plan output" })).toHaveCount(0);
  await expect(card.getByRole("region", { name: "Plan", exact: true })).toHaveCount(0);
  await expect(card.getByText("Last Deploy", { exact: true })).toBeVisible();
  expect(setup.unexpectedRequests).toEqual([]);
});

test("Hides successful plan details and run errors when a prerequisite becomes missing", async ({ page, context }) => {
  const { card, unexpectedRequests } = await prepareStage(page, context, stages[0]);
  await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
  await advanceStagePoll(page, card);
  await expect(card.getByText("terraform_data.SubscriptionBudget", { exact: true })).toBeVisible();
  await page.route(`${GITHUB_API_URL}/**/dispatches`, (route) => replyJson(route, { message: "Denied" }, 403));
  await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
  await expect(card.getByRole("alert").filter({ hasText: /^Failed to trigger workflow$/ })).toBeVisible();
  await card.getByRole("button", { name: "open prerequisites" }).click();
  const email = card.getByLabel("CONTACT_EMAILS:");
  await email.fill("   ");
  await card.getByRole("button", { name: "Update 1 variable" }).click();
  await expect(card.getByText("CONTACT_EMAILS not set", { exact: true })).toBeVisible();
  await expect(card.getByRole("region", { name: "Plan", exact: true })).toHaveCount(0);
  await expect(card.getByText("terraform_data.SubscriptionBudget", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Deploy", exact: true })).toHaveCount(0);
  await expect(card.getByRole("alert").filter({ hasText: /^Failed to trigger workflow$/ })).toHaveCount(0);
  await email.fill("owner@example.com");
  await card.getByRole("button", { name: "Update 1 variable" }).click();
  await expect(card.getByRole("region", { name: "Plan", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
  expect(unexpectedRequests).toEqual([]);
});

test("Hides a changed plan and refreshes from prerequisites with retry available", async ({ page, context }, testInfo) => {
  const setup = await prepareCardMocks(page, context);
  const snapshot = { ...setup.github.variables };
  let dispatches = 0;
  const planZip = await new JSZip().file("plan.json", JSON.stringify({
    resource_changes: [{ address: "terraform_data.SubscriptionBudget", change: { actions: ["create"] } }],
  })).generateAsync({ type: "nodebuffer" });
  await page.route(`${GITHUB_API_URL}/**/deployments?*`, (route) => {
    const task = new URL(route.request().url()).searchParams.get("task");
    return replyJson(route, task === "plan:SubscriptionBudget" ? [{
      created_at: dispatches > 1 ? "2026-10-05T03:00:00Z" : "2026-10-05T01:00:00Z",
      sha: "prod-mock-sha",
      payload: { stage: "SubscriptionBudget", status: "success", runId: dispatches > 1 ? "new" : "old", planJsonId: 1101, envId: dispatches > 1 ? 1104 : 1103 },
    }] : []);
  });
  await page.route(`${GITHUB_API_URL}/**/actions/artifacts/*/zip`, async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-2));
    if (id === 1101) return route.fulfill({ contentType: "application/zip", body: planZip });
    if (![1103, 1104].includes(id)) return route.fallback();
    const values = id === 1103 ? snapshot : setup.github.variables;
    const body = await new JSZip().file("corp.env", Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n"))
      .generateAsync({ type: "nodebuffer" });
    return route.fulfill({ contentType: "application/zip", body });
  });
  await page.route(`${GITHUB_API_URL}/**/dispatches`, (route) => {
    dispatches++;
    return dispatches === 1 ? replyJson(route, { message: "Denied" }, 403) : route.fulfill({ status: 204 });
  });
  const card = await setup.open("stage_SubscriptionBudget");
  await expect(card.getByText("terraform_data.SubscriptionBudget", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "open prerequisites" }).click();
  await card.getByLabel("CONTACT_EMAILS:").fill("new-owner@example.com");
  await card.getByRole("button", { name: "Update 1 variable" }).click();
  await expect(card.getByText("CONTACT_EMAILS changed since last plan", { exact: true })).toBeVisible();
  await expect(card.getByRole("region", { name: "Plan", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toHaveCount(0);
  await card.locator('button[aria-controls="SubscriptionBudget-prerequisites"]').click();
  await expect(card.getByRole("region", { name: "Prerequisites", exact: true })).toHaveCount(0);
  const refresh = card.getByRole("button", { name: "Refresh plan", exact: true });
  await expect(refresh).toBeVisible();
  await testInfo.attach("changed-prerequisite", { body: await card.screenshot({ animations: "disabled" }), contentType: "image/png" });
  await refresh.click();
  await expect(card.getByRole("group", { name: "Refresh changed prerequisites" })).toContainText("Failed to trigger workflow");
  await expect(card.getByText("CONTACT_EMAILS changed since last plan", { exact: true })).toBeVisible();
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await advanceStagePoll(page, card);
  await expect(card.getByRole("region", { name: "Plan", exact: true })).toBeVisible();
  await expect(refresh).toHaveCount(0);
  await expect(card.getByText("terraform_data.SubscriptionBudget", { exact: true })).toBeVisible();
  expect(dispatches).toBe(2);
  expect(setup.unexpectedRequests).toEqual([]);
});

test("Reports a missing plan artifact without claiming an empty plan", async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  const { card, state, unexpectedRequests } = await prepareStage(page, context, stages[0], { missingArtifact: true });
  await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
  await expect(card.getByRole("button", { name: /^Running/ })).toBeDisabled();
  await advanceStagePoll(page, card);
  await expect(card.getByText("Failed to download the package: 410", { exact: true })).toBeVisible();
  await expect(card.getByText("No changes detected.", { exact: true })).toHaveCount(0);
  expect(state.downloads).toBe(1);
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "expired-plan", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo, stage: (typeof stages)[number]) {
  test.setTimeout(240_000);
  const { card, state, unexpectedRequests } = await prepareStage(page, context, stage);
  const viewport = getViewportName(testInfo);
  await test.step("Request a plan for this stage and selected environment only", async () => {
    await expect(card.locator("h3")).toContainText(stage.title);
    await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
    await expectSnapshot(page, card, testInfo, `${stage.snapshotDir}-start`, viewport);
    await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
    await expect(card.getByRole("button", { name: /^Running/ })).toBeDisabled();
    await expect.poll(() => state.dispatches).toBe(1);
    await expectSnapshot(page, card, testInfo, `${stage.snapshotDir}-running`, viewport);
  });
  await test.step("Read the stage report and render the downloaded Terraform plan", async () => {
    await advanceStagePoll(page, card);
    await expect(card.getByText(`terraform_data.${stage.dir}`, { exact: true })).toBeVisible();
    await expect(card.getByText("create 1", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
    await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
    expect(state.downloads).toBe(1);
    expect(state.reportTasks).toContain(`plan:${stage.dir}`);
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, `${stage.snapshotDir}-end`, viewport);
  });
}

async function prepareStage(
  page: Page,
  context: BrowserContext,
  stage: { dir: string; title: string },
  options: { denyDispatch?: boolean; missingArtifact?: boolean } = {}
) {
  const setup = await prepareCardMocks(page, context);
  const state = { dispatches: 0, downloads: 0, reportTasks: [] as string[] };
  const zip = await new JSZip()
    .file(
      "plan.json",
      JSON.stringify({
        resource_changes: [{ address: `terraform_data.${stage.dir}`, change: { actions: ["create"] } }],
      })
    )
    .generateAsync({ type: "nodebuffer" });
  const assignedPermissions = [
    "62a82d76-70ea-41e2-9197-370581804d09",
    "dbaae8cf-10b5-4b86-a4a1-f871c94c6695",
    "741f803b-c850-494e-b5df-cde7c675a1ca",
    "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9",
    "06b708a9-e830-4db3-a914-8e69da51d44f",
    "9e3f62cf-ca93-4989-b6ce-bf83c28f9fe8",
    "50483e42-d915-4231-9639-7fdb7fd190e5",
    "29c18626-4985-4dcd-85c0-193eef327366",
    "be74164b-cff1-491c-8741-e671cb536e13",
    "7e05723c-0bb0-42da-be95-ae9f08a6e53c",
  ];
  await page.route(`${MICROSOFT_GRAPH_URL}/v1.0/servicePrincipals/*/appRoleAssignments?*`, (route) => {
    expect(route.request().method()).toBe("GET");
    return replyJson(route, { value: assignedPermissions.map((appRoleId) => ({ appRoleId })) });
  });
  await page.route(`${GITHUB_API_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/deployments")) {
      expect(request.method()).toBe("GET");
      expect(url.searchParams.get("environment")).toBe("PROD");
      expect(url.searchParams.get("per_page")).toBe("1");
      const task = url.searchParams.get("task") ?? "";
      const privAvdDirs = ["privavd-gallery", "privavd-image", "privavd-paw"];
      expect([
        ...[...stages.map(({ dir }) => dir), ...privAvdDirs].flatMap((dir) => [`plan:${dir}`, `deploy:${dir}`]),
        "build:backend",
        "build:frontend",
      ]).toContain(task);
      state.reportTasks.push(task);
      return replyJson(
        route,
        state.dispatches && !options.denyDispatch && task === `plan:${stage.dir}`
          ? [
              {
                created_at: "2026-10-05T03:00:00Z",
                sha: "prod-mock-sha",
                payload: { stage: stage.dir, status: "success", runId: "mock-stage-run", planJsonId: "1101" },
              },
            ]
          : []
      );
    }
    if (url.pathname.endsWith("/dispatches")) {
      expect(request.method()).toBe("POST");
      expect(url.pathname).toBe(`/repos/mock-user/${setup.repoName}/actions/workflows/plan.yml/dispatches`);
      expect(request.postDataJSON()).toEqual({ ref: "PROD", inputs: { github_env_name: "PROD", dir: stage.dir } });
      state.dispatches++;
      return options.denyDispatch ? replyJson(route, { message: "Mock workflow denied" }, 403) : route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith("/actions/artifacts/1101/zip")) {
      expect(request.method()).toBe("GET");
      state.downloads++;
      return route.fulfill({ status: options.missingArtifact ? 410 : 200, contentType: "application/zip", body: zip });
    }
    return route.fallback();
  });
  const card = await setup.open(`stage_${stage.dir}`);
  return { ...setup, card, state };
}

async function advanceStagePoll(page: Page, card: Locator) {
  await expect(card.getByRole("button", { name: /^Running\.\.\. [1-9]\d*[sm]$/ })).toBeDisabled();
  await test.step("Advance the stage polling countdown", async () => {
    await page.clock.fastForward(151_000);
  }, { timeout: 60_000 });
}
