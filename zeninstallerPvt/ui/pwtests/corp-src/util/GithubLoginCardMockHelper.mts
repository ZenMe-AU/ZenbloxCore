/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type BrowserContext, type Page } from "@playwright/test";
import { CORP_URL, GITHUB_API_URL, MOCK_BACKEND_URL } from "../../testInit";
import { installMockBackend } from "./mockTestHelper.mts";
import { installRelayNetworkGuard } from "./RemoteTerminalInfraCardMockHelper.mts";

export async function prepareGithubLoginMock(page: Page, context: BrowserContext, backendAvailable = true) {
  const unexpectedRequests = await installRelayNetworkGuard(context);
  await page.route(`${GITHUB_API_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    expect(route.request().method(), "Authentication fixtures must never write to GitHub").toBe("GET");
    if (path === "/user") {
      expect(route.request().headers().authorization).toBe("Bearer ghp_mock");
      return route.fulfill({ json: { login: "mock-user", id: 12345 } });
    }
    if (path === "/user/orgs" || path === "/user/repos") return route.fulfill({ json: [] });
    unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort("blockedbyclient");
  });
  await installMockBackend(page);
  await page.route(/\/corp-src\/api\/backend\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const configuration = "const url = import.meta.env.VITE_API_URL;";
    expect(source).toContain(configuration);
    await route.fulfill({
      response,
      body: source.replace(configuration, `const url = ${backendAvailable ? JSON.stringify(MOCK_BACKEND_URL) : "undefined"};`),
    });
  });
  await page.goto(CORP_URL);
  return { unexpectedRequests };
}

export async function installGithubOAuthCallback(page: Page) {
  const exchanges: Record<string, string>[] = [];
  const authorizations: URL[] = [];
  await page.route("https://github.com/login/oauth/authorize?**", async (route) => {
    const url = new URL(route.request().url());
    authorizations.push(url);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("scope")).toContain("repo");
    const callback = new URL(CORP_URL);
    callback.searchParams.set("code", "mock-oauth-code");
    callback.searchParams.set("state", url.searchParams.get("state") ?? "");
    await route.fulfill({ status: 302, headers: { location: callback.toString() }, body: "" });
  });
  await page.route(`${MOCK_BACKEND_URL}/getGhToken`, async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as Record<string, string>;
    expect(body.code).toBe("mock-oauth-code");
    expect(body.redirect_uri).toBe(new URL(CORP_URL).origin);
    expect(body.code_verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    exchanges.push(body);
    await route.fulfill({ json: { access_token: "mock-oauth-token" } });
  });
  await page.route(`${GITHUB_API_URL}/user`, (route) => {
    expect(route.request().headers().authorization).toBe("Bearer mock-oauth-token");
    return route.fulfill({ json: { login: "mock-user", id: 12345 } });
  });
  return { exchanges, authorizations };
}
