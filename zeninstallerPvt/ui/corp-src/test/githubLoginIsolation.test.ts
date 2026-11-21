/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, expect, it, vi } from "vitest";
import { fetchWithAuth, GH_TOKEN_HEADER } from "../api/backend";
import { createGithubApi } from "../api/github";
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
