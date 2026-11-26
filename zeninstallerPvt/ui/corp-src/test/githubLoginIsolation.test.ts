/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, expect, it, vi } from "vitest";
import { fetchWithAuth, GH_TOKEN_HEADER } from "../api/backend";
import { createGithubApi } from "../api/github";
import { createRepoApi } from "../cards/RepoV2/api";
import { SensitiveToken } from "../appContext";
import { clearStoredToken, getStoredToken, setStoredToken } from "../logic/tokenStore";
import { captureOAuthReturn, takePendingCode } from "../logic/oauth";

afterEach(() => {
  clearStoredToken("github_access_token");
  sessionStorage.clear();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("keeps explicit V2 backend credentials and expiry events separate from legacy", async () => {
  setStoredToken("github_access_token", "legacy-token");
  const fetchMock = vi.fn().mockResolvedValue({ status: 401 });
  vi.stubGlobal("fetch", fetchMock);
  const legacyExpired = vi.fn();
  const v2Expired = vi.fn();
  window.addEventListener("auth:session-expired", legacyExpired);
  window.addEventListener("auth:session-expired:github_login_v2", v2Expired);
  try {
    await fetchWithAuth("https://example.test", {}, { token: "v2-token", expiryEvent: "auth:session-expired:github_login_v2" });
    expect(fetchMock.mock.calls[0][1].headers[GH_TOKEN_HEADER]).toBe("Bearer v2-token");
    expect(v2Expired).toHaveBeenCalledOnce();
    expect(legacyExpired).not.toHaveBeenCalled();
    await fetchWithAuth("https://example.test");
    expect(fetchMock.mock.calls[1][1].headers[GH_TOKEN_HEADER]).toBe("Bearer legacy-token");
    expect(legacyExpired).toHaveBeenCalledOnce();
    expect(v2Expired).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("auth:session-expired", legacyExpired);
    window.removeEventListener("auth:session-expired:github_login_v2", v2Expired);
  }
});

it("verifies the V2 direct token without consulting the legacy token", async () => {
  setStoredToken("github_access_token", "legacy-token");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: "v2-user" }) });
  vi.stubGlobal("fetch", fetchMock);
  expect(await createGithubApi("v2-token").verifyAuth()).toEqual({ login: "v2-user" });
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer v2-token");
  expect(getStoredToken(["github_access_token"])).toBe("legacy-token");
});

it("uses the V2 token for every backend repository operation", async () => {
  setStoredToken("github_access_token", "legacy-token");
  const data = {
    user: { login: "v2-user", id: 1 }, orgList: [], repoList: [], isTemplate: true, templateName: "template",
    data: { id: 2, name: "repo" }, envSuccess: true, results: { envs: [] }, branches: [],
    branch: { name: "PROD", commit: "abc", protected: false }, envList: [],
  };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data });
  vi.stubGlobal("fetch", fetchMock);
  const api = createRepoApi(new SensitiveToken("v2-token"), "backend");
  const account = { login: "v2-user", id: 1, type: "User" as const };
  await Promise.all([
    api.fetchOrgList(), api.fetchRepos(account), api.checkTemplate(account, "repo"),
    api.generateRepo(account, "repo", true, false, false, "owner/template", ["PROD"]),
    api.fetchBranches(account, "repo"), api.createBranch(account, "repo", "PROD", "main"), api.fetchEnvs(account, "repo"),
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(8);
  for (const [, init] of fetchMock.mock.calls) expect(init.headers[GH_TOKEN_HEADER]).toBe("Bearer v2-token");
  expect(getStoredToken(["github_access_token"])).toBe("legacy-token");
});

it("uses the V2 token for direct repository requests", async () => {
  setStoredToken("github_access_token", "legacy-token");
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, headers: new Headers(), json: async () => [{ id: 2, name: "repo", owner: { type: "User" } }],
  });
  vi.stubGlobal("fetch", fetchMock);
  const api = createRepoApi(new SensitiveToken("v2-token"), "direct");
  await expect(api.fetchRepos({ login: "v2-user", id: 1, type: "User" })).resolves.toEqual([{ id: 2, name: "repo" }]);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer v2-token");
  expect(getStoredToken(["github_access_token"])).toBe("legacy-token");
});

it("routes V2 OAuth callbacks without consuming a pending legacy callback", () => {
  sessionStorage.setItem("oauth_pending_code", "legacy-code");
  sessionStorage.setItem("oauth_pending_provider", "github");
  const state = encodeURIComponent("github_login_v2:/");
  window.history.replaceState({}, "", `/?code=v2-code&state=${state}`);
  captureOAuthReturn();
  expect(takePendingCode("github")).toBe("legacy-code");
  expect(takePendingCode("github_login_v2")).toBe("v2-code");
  expect(takePendingCode("github_login_v2")).toBeNull();
});
