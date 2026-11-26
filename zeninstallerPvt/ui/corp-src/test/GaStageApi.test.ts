/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerWorkflow } from "../cards/GaStage/api";

const authRecordKey = "zeninstaller_github_auth";
const account = { login: "owner", type: "Organization", id: 1 } as const;
let previousAuthRecord: string | null;

beforeEach(() => {
  previousAuthRecord = sessionStorage.getItem(authRecordKey);
});

afterEach(() => {
  if (previousAuthRecord === null) sessionStorage.removeItem(authRecordKey);
  else sessionStorage.setItem(authRecordKey, previousAuthRecord);
  vi.unstubAllGlobals();
});

describe("GaStage API", () => {
  it("uses the copied direct GitHub workflow API for direct sign-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(authRecordKey, JSON.stringify({ mode: "direct", token: "test-token" }));

    await triggerWorkflow(account, "repo", "deploy.yml", "PROD", "main", "GaStage");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/workflows/deploy.yml/dispatches",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("uses the copied backend workflow API for backend sign-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(authRecordKey, JSON.stringify({ mode: "backend" }));

    await triggerWorkflow(account, "repo", "deploy.yml", "PROD", "main", "GaStage");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/triggerActions$/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
