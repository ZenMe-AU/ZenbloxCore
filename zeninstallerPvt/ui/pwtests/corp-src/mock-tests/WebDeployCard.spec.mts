/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/WebDeploy/WebDeployCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import JSZip from "jszip";
import { test, getViewportName } from "../../../../../.playwright/viewportFixture.mjs";
import { expectSnapshot } from "../../../../../.playwright/testHelper.js";
import { GITHUB_API_URL } from "../../testInit";
import { prepareCardMocks, replyJson, siteStorage, siteUrl } from "../util/mockCardSetup.mts";

const build = { version: "2.0.0", sha: "abcdef0123456789", runId: "mock-frontend-run", artifactId: 2201, builtAt: 1791169200 };

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Does not upload when the build published no site artifact", async ({ page, context }, testInfo) => {
  const { card, state, unexpectedRequests } = await prepareWeb(page, context, { missingArtifact: true });
  await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
  await card.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(card.getByText("The latest build did not publish a site artifact.", { exact: true })).toBeVisible();
  expect(state.uploads).toEqual([]);
  expect(state.metadataWrites).toBe(0);
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "missing-artifact", getViewportName(testInfo));
});

test("Does not record the new version after a failed blob upload", async ({ page, context }, testInfo) => {
  const { card, state, unexpectedRequests } = await prepareWeb(page, context, { denyUpload: true });
  await card.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(card.getByText(/Mock blob upload denied/).first()).toBeVisible();
  expect(state.metadataWrites).toBe(0);
  await expect(card.getByText(/^Live on the site:/)).toContainText("nothing deployed");
  await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "upload-denied", getViewportName(testInfo));
});

test("Disables build and deployment when the GitHub OAuth client ID is missing", async ({ page, context }, testInfo) => {
  const { card, state, unexpectedRequests } = await prepareWeb(page, context, { missingClient: true });
  await expect(card.getByText(/Set VITE_GITHUB_CLIENT_ID on this environment first/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Build", exact: true })).toBeDisabled();
  await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
  expect(state.dispatches).toBe(0);
  expect(state.uploads).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "missing-oauth-client", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo) {
  const { card, state, unexpectedRequests } = await prepareWeb(page, context, { noBuild: true });
  const viewport = getViewportName(testInfo);
  await test.step("Build the site using the selected repository and environment", async () => {
    await expect(card.getByRole("button", { name: "Build", exact: true })).toBeEnabled();
    await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
    await expectSnapshot(page, card, testInfo, "start", viewport);
    await card.getByRole("button", { name: "Build", exact: true }).click();
    await expect(card.getByRole("button", { name: "Building...", exact: true })).toBeDisabled();
    await page.clock.runFor(30_001);
    await expect(card.getByText(/^Latest build:/)).toContainText("abcdef0 (v2.0.0)");
    await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
    expect(state.dispatches).toBe(1);
    await expectSnapshot(page, card, testInfo, "built", viewport);
  });
  await test.step("Upload the artifact files and read back the live site version", async () => {
    await card.getByRole("button", { name: "Deploy", exact: true }).click();
    await expect(card.getByText(/^Live on the site:/)).toContainText("abcdef0 (v2.0.0)");
    await expect(card.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled();
    expect(state.uploads).toEqual([
      { path: "/$web/index.html", contentType: "text/html; charset=utf-8", body: "<html>Mock private installer</html>" },
      { path: "/$web/assets/app.js", contentType: "text/javascript; charset=utf-8", body: 'console.log("mock frontend");' },
    ]);
    expect(state.metadataWrites).toBe(1);
    expect(state.metadataReads).toBeGreaterThanOrEqual(2);
    await expect(card.getByRole("link", { name: "Zeninstaller Private site" })).toHaveAttribute("href", new RegExp(`^${siteUrl.replace(/\./g, "\\.")}/\\?`));
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, "end", viewport);
  });
}

async function prepareWeb(
  page: Page,
  context: BrowserContext,
  options: { noBuild?: boolean; missingArtifact?: boolean; denyUpload?: boolean; missingClient?: boolean } = {}
) {
  const setup = await prepareCardMocks(page, context, options.missingClient ? { VITE_GITHUB_CLIENT_ID: "" } : {}, { frontend: true });
  const state = {
    hasBuild: !options.noBuild,
    dispatches: 0,
    metadataWrites: 0,
    metadataReads: 0,
    uploads: [] as { path: string; contentType: string; body: string | null }[],
    metadata: {} as Record<string, string>,
  };
  const zip = await new JSZip()
    .file("index.html", "<html>Mock private installer</html>")
    .file("assets/app.js", 'console.log("mock frontend");')
    .generateAsync({ type: "nodebuffer" });
  await page.route(`${GITHUB_API_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/deployments") && url.searchParams.get("task") === "build:frontend") {
      expect(request.method()).toBe("GET");
      expect(url.searchParams.get("environment")).toBe("PROD");
      return replyJson(
        route,
        state.hasBuild
          ? [
              {
                payload: { ...build, artifactId: options.missingArtifact ? null : build.artifactId },
                created_at: "2026-10-05T03:00:00Z",
              },
            ]
          : []
      );
    }
    if (url.pathname.endsWith("/dispatches")) {
      expect(request.method()).toBe("POST");
      expect(url.pathname).toBe(`/repos/mock-user/${setup.repoName}/actions/workflows/buildFrontend.yml/dispatches`);
      expect(request.postDataJSON()).toEqual({ ref: "PROD", inputs: { github_env_name: "PROD" } });
      state.dispatches++;
      state.hasBuild = true;
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith(`/actions/artifacts/${build.artifactId}/zip`)) {
      expect(request.method()).toBe("GET");
      return route.fulfill({ contentType: "application/zip", body: zip });
    }
    return route.fallback();
  });
  await page.route(`https://${siteStorage}.blob.core.windows.net/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/$web" && url.searchParams.get("comp") === "metadata") {
      if (request.method() === "GET") {
        state.metadataReads++;
        return route.fulfill({
          status: state.metadataWrites ? 200 : 404,
          headers: { ...state.metadata, "access-control-expose-headers": "x-ms-meta-version, x-ms-meta-sha, x-ms-meta-builtat" },
        });
      }
      expect(request.method()).toBe("PUT");
      const headers = request.headers();
      expect(headers["x-ms-meta-version"]).toBe(build.version);
      expect(headers["x-ms-meta-sha"]).toBe(build.sha);
      expect(headers["x-ms-meta-builtat"]).toBe(String(build.builtAt));
      state.metadata = {
        "x-ms-meta-version": headers["x-ms-meta-version"],
        "x-ms-meta-sha": headers["x-ms-meta-sha"],
        "x-ms-meta-builtat": headers["x-ms-meta-builtat"],
      };
      state.metadataWrites++;
      return route.fulfill({ status: 200 });
    }
    expect(request.method()).toBe("PUT");
    expect(request.headers()["x-ms-blob-type"]).toBe("BlockBlob");
    expect(["/$web/index.html", "/$web/assets/app.js"]).toContain(url.pathname);
    state.uploads.push({ path: url.pathname, contentType: request.headers()["content-type"], body: request.postData() });
    return route.fulfill({ status: options.denyUpload ? 403 : 201, body: options.denyUpload ? "Mock blob upload denied" : "" });
  });
  const card = await setup.open("web_deploy");
  await expect(card.getByText(/checking\.\.\./)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Build", exact: true })).toBeVisible();
  return { ...setup, card, state };
}
