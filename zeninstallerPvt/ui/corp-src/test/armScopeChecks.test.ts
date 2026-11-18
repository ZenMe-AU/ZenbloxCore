/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { ensureCardResourceAccess } from "../api/azureArm";
import type { ArmRole } from "../types";

vi.mock("../auth/msal", () => ({ getToken: async () => "token" }));

const account = { tenantId: "t" } as AccountInfo;
const NAME_CHECK = "Microsoft.Storage/checkNameAvailability/read";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const check = (armRoles: ArmRole[]) => ensureCardResourceAccess(account, "s", { resourceProviders: [], appConsent: [], armRoles, entraRoles: [] });

// Every group exists, only the listed resources do, the caller holds nothing, and Function App "fa" sits in rg-old.
function stubAzure(existing: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/resources")) return json({ value: [{ id: "/subscriptions/s/resourceGroups/rg-old/providers/Microsoft.Web/sites/fa", name: "fa" }] });
    const scope = path.replace(/\/providers\/Microsoft\.Authorization\/permissions$/, "");
    if (scope === path) return json({});
    return scope.includes("/providers/") && !existing.includes(scope) ? new Response("not found", { status: 404 }) : json({ value: [] });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("ensureCardResourceAccess scopes", () => {
  const storage: ArmRole = { scope: { resourceGroup: "rg", resource: "Microsoft.Storage/storageAccounts/sa" }, actions: [], createActions: [NAME_CHECK] };

  it("checks createActions at the subscription while the resource is missing", async () => {
    stubAzure([]);
    await expect(check([storage])).rejects.toThrow(`Azure access required at /subscriptions/s\n\nMissing permissions: ${NAME_CHECK}`);
  });

  it("skips createActions once the resource exists", async () => {
    stubAzure(["/subscriptions/s/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa"]);
    await expect(check([storage])).resolves.toBeUndefined();
  });

  it("checks a missing resource in the group of the resource it locates by", async () => {
    stubAzure([]);
    await expect(check([{ scope: { resourceGroup: "rg", resource: "Microsoft.Web/serverfarms/plan", locate: "Microsoft.Web/sites/fa" }, actions: ["Microsoft.Web/serverfarms/write"] }]))
      .rejects.toThrow("Azure access required at /subscriptions/s/resourceGroups/rg-old\n\nMissing permissions: Microsoft.Web/serverfarms/write");
  });
});
