/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/Stage/StageCard.tsx (all six mounted pipeline stages)
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import JSZip from "jszip";
import { test, getViewportName } from "../util/viewportFixture.mts";
import { expectSnapshot } from "../../util/testHelper.ts";
import { GITHUB_API_URL, MICROSOFT_GRAPH_URL } from "../../testInit";
import { prepareCardMocks, replyJson } from "../util/mockCardSetup.mts";

const stages = [
  { dir: "c01subscription", title: "Azure subscription budget" },
  { dir: "c02globalGroups", title: "Organisation security groups" },
  { dir: "c07userAccounts", title: "User accounts and sign-in" },
  { dir: "c20awsentrasso", title: "AWS single sign-on with Entra ID" },
  { dir: "c21awsentrassoP2", title: "AWS single sign-on with Microsoft Entra ID P2" },
  { dir: "c25cloudfront", title: "AWS CloudFront distribution" },
];

for (const stage of stages) {
  test(`Happy path: ${stage.dir}`, async ({ page, context }, testInfo) => {
    await runHappyPath(page, context, testInfo, stage);
  });

  test(`Reports a workflow permission failure: ${stage.dir}`, async ({ page, context }, testInfo) => {
    const { card, state, unexpectedRequests } = await prepareStage(page, context, stage, { denyDispatch: true });
    await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
    await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
    await expect(card.getByText("Failed to trigger workflow", { exact: true })).toBeVisible();
    expect(state.dispatches).toBe(1);
    expect(state.downloads).toBe(0);
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, `${stage.dir}-dispatch-denied`, getViewportName(testInfo));
  });
}

test("Reports a missing plan artifact without claiming an empty plan", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const { card, state, unexpectedRequests } = await prepareStage(page, context, stages[0], { missingArtifact: true });
  await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
  await expect(card.getByRole("button", { name: /^Running/ })).toBeDisabled();
  await advanceStagePoll(page);
  await expect(card.getByText("Failed to download the package: 410", { exact: true })).toBeVisible();
  await expect(card.getByText("No changes detected.", { exact: true })).toHaveCount(0);
  expect(state.downloads).toBe(1);
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "expired-plan", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo, stage: { dir: string; title: string }) {
  test.setTimeout(120_000);
  const { card, state, unexpectedRequests } = await prepareStage(page, context, stage);
  const viewport = getViewportName(testInfo);
  await test.step("Request a plan for this stage and selected environment only", async () => {
    await expect(card.locator("h3")).toContainText(stage.title);
    await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
    await expectSnapshot(page, card, testInfo, `${stage.dir}-start`, viewport);
    await card.getByRole("button", { name: "Get Updated Plan", exact: true }).click();
    await expect(card.getByRole("button", { name: /^Running/ })).toBeDisabled();
    await expect.poll(() => state.dispatches).toBe(1);
    await expectSnapshot(page, card, testInfo, `${stage.dir}-running`, viewport);
  });
  await test.step("Read the stage report and render the downloaded Terraform plan", async () => {
    await advanceStagePoll(page);
    await expect(card.getByText(`terraform_data.${stage.dir}`, { exact: true })).toBeVisible();
    await expect(card.getByText("create 1", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Get Updated Plan", exact: true })).toBeEnabled();
    await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
    expect(state.downloads).toBe(1);
    expect(state.reportTasks).toContain(`plan:${stage.dir}`);
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, `${stage.dir}-end`, viewport);
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
      expect([...stages.flatMap(({ dir }) => [`plan:${dir}`, `deploy:${dir}`]), "build:backend", "build:frontend"]).toContain(task);
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
      expect(url.pathname).toBe(`/repos/mock-user/${setup.repoName}/actions/workflows/plan-${stage.dir}.yml/dispatches`);
      expect(request.postDataJSON()).toEqual({ ref: "PROD", inputs: { github_env_name: "PROD" } });
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

async function advanceStagePoll(page: Page) {
  // Fast-forward each interval tick without replaying 150 seconds of animation frames.
  for (let second = 0; second < 150; second++) await page.clock.fastForward(1_000);
}
