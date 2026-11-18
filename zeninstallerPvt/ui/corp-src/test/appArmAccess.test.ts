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
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const check = (armRoles: ArmRole[]) => ensureCardResourceAccess(account, "s", { resourceProviders: [], appConsent: [], armRoles, entraRoles: [] });
const request: ArmRole[] = [{ scope: "subscription", objectId: "sp", actions: ["*/read"] }];

// The app holds Reader at each listed scope; every group and resource exists and the signed-in user holds nothing.
function stubAssignments(scopes: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("roleAssignments")) return json({ value: scopes.map((scope) => ({ properties: { scope, roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/reader" } })) });
    if (url.includes("roleDefinitions")) return json({ properties: { permissions: [{ actions: ["*/read"] }] } });
    return json(url.includes("/permissions") ? { value: [] } : {});
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("ensureCardResourceAccess for another principal", () => {
  it("counts a role inherited from a management group", async () => {
    stubAssignments(["/providers/Microsoft.Management/managementGroups/root"]);
    await expect(check(request)).resolves.toBeUndefined();
  });

  it("ignores a role held only on a resource group below the scope", async () => {
    stubAssignments(["/subscriptions/s/resourceGroups/rg"]);
    await expect(check(request)).rejects.toThrow("Missing permissions: */read\n\nPrincipal sp needs these.");
  });

  it("checks a child under the principal's resource for the same principal", async () => {
    stubAssignments(["/subscriptions/s"]);
    await expect(check([{ scope: { resourceGroup: "rg", resource: "Microsoft.Storage/storageAccounts/sa" }, objectId: "sp", actions: ["*/read"], children: [{ path: "blobServices/default", actions: ["*/read"] }] }]))
      .resolves.toBeUndefined();
  });

  it("still checks the signed-in user's roles in the same request against the user", async () => {
    stubAssignments(["/subscriptions/s"]);
    await expect(check([...request, { scope: "subscription", actions: ["Microsoft.Resources/subscriptions/read"] }]))
      .rejects.toThrow("Azure access required at /subscriptions/s\n\nMissing permissions: Microsoft.Resources/subscriptions/read\n\nAsk an administrator");
  });
});
