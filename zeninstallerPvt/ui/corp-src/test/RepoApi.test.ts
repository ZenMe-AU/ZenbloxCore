/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, expect, it, vi } from "vitest";
import { createRepoApi } from "../cards/RepoV2/api";
import { SensitiveToken } from "../appContext";

const account = { login: "owner", id: 1, type: "User" as const };

afterEach(() => vi.unstubAllGlobals());

it.each(["direct", "backend"] as const)("loads main and creates TEST from its commit through %s", async (mode) => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json(mode === "direct"
      ? [{ name: "main", commit: { sha: "main-sha" }, protected: false }]
      : { branches: [{ name: "main", commit: "main-sha", protected: false }] }));
  if (mode === "direct") fetchMock.mockResolvedValueOnce(Response.json({ object: { sha: "main-sha" } }));
  fetchMock.mockResolvedValueOnce(Response.json(mode === "direct"
    ? { ref: "refs/heads/TEST", object: { sha: "main-sha" } }
    : { branch: { name: "TEST", commit: "main-sha", protected: false } }));
  vi.stubGlobal("fetch", fetchMock);
  const api = createRepoApi(new SensitiveToken("test-token"), mode);

  expect(await api.fetchBranches(account, "repo")).toEqual([{ name: "main", commit: "main-sha", protected: false }]);
  expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  expect(await api.createBranch(account, "repo", "TEST", "main")).toEqual({ name: "TEST", commit: "main-sha", protected: false });
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  expect(url).toContain(mode === "direct" ? "/git/refs" : "/createBranch");
  expect(JSON.parse(init.body)).toMatchObject(mode === "direct"
    ? { ref: "refs/heads/TEST", sha: "main-sha" }
    : { branch: "TEST", source: "main" });
});

it.each(["direct", "backend"] as const)("preserves the duplicate repository error through %s", async (mode) => {
  const message = "Could not clone: Name already exists on this account";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
    mode === "direct" ? { message, errors: [message], status: "422" } : { error: message },
    { status: 422 },
  )));
  const api = createRepoApi(new SensitiveToken("test-token"), mode);
  await expect(api.generateRepo(account, "aaaa", true, false, false, "ZenMe-AU/ZenbloxCore", []))
    .rejects.toThrow(`Could not clone repository "owner/aaaa": 422 - ${message}`);
});

it.each(["direct", "backend"] as const)("preserves branch permission errors through %s", async (mode) => {
  const message = "Resource not accessible by personal access token";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
    mode === "direct" ? { message } : { error: message },
    { status: 403 },
  )));
  const api = createRepoApi(new SensitiveToken("test-token"), mode);
  await expect(api.createBranch(account, "repo", "TEST", "main")).rejects.toThrow(`403 - ${message}`);
});

it("reports a non-JSON branch error instead of hiding it", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Service unavailable", { status: 503 })));
  const api = createRepoApi(new SensitiveToken("test-token"), "direct");
  await expect(api.fetchBranches(account, "repo")).rejects.toThrow("503 - Service unavailable");
});
