/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { ensureEntraActions, isInternalTenantMember } from "../api/azureGraph";

const consent = vi.hoisted(() => ({ granted: true }));
vi.mock("../auth/msal", () => ({ getToken: async () => "token", hasScopeConsent: async () => consent.granted }));

const GLOBAL_ADMIN = "62e90394-69f5-4237-9190-012177145e10";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const account = { tenantId: "t" } as AccountInfo;

// The user holds these role templates; each role grants the listed actions.
function stubRoles(roles: Record<string, string[]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("transitiveMemberOf")) return json({ value: Object.keys(roles).map((roleTemplateId) => ({ roleTemplateId })) });
    const id = Object.keys(roles).find((templateId) => url.includes(`roleDefinitions/${templateId}`))!;
    return json({ rolePermissions: [{ allowedResourceActions: roles[id] }] });
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  consent.granted = true;
});

describe("ensureEntraActions", () => {
  it("passes Global Administrator without reading its role definition", async () => {
    stubRoles({ [GLOBAL_ADMIN]: [] });
    await expect(ensureEntraActions(account, ["microsoft.directory/userCredentialPolicies/basic/update"])).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("lets allTasks cover the actions under it, across roles", async () => {
    stubRoles({ a: ["microsoft.directory/users/allProperties/allTasks"], b: ["microsoft.directory/groups/create"] });
    await expect(ensureEntraActions(account, ["microsoft.directory/users/create", "microsoft.directory/groups/create"])).resolves.toBeUndefined();
  });

  it("names every action no role grants", async () => {
    stubRoles({ a: ["microsoft.directory/users/create", "microsoft.directory/groupsX/allTasks"] });
    await expect(ensureEntraActions(account, ["microsoft.directory/users/create", "microsoft.directory/groups/create", "microsoft.directory/domains/allProperties/allTasks"]))
      .rejects.toThrow("missing these Microsoft Entra permissions:\nmicrosoft.directory/groups/create\nmicrosoft.directory/domains/allProperties/allTasks");
  });

  it("asks for consent before reading any roles", async () => {
    consent.granted = false;
    stubRoles({});
    await expect(ensureEntraActions(account, ["microsoft.directory/users/create"])).rejects.toThrow("Recheck to grant it");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips Graph when the stage needs no Entra actions", async () => {
    stubRoles({});
    await ensureEntraActions(account, []);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("isInternalTenantMember", () => {
  it("accepts only members without an external UPN", () => {
    expect(isInternalTenantMember({ userType: "Member", userPrincipalName: "user@contoso.com" })).toBe(true);
    expect(isInternalTenantMember({ userType: "Guest", userPrincipalName: "guest@contoso.com" })).toBe(false);
    expect(isInternalTenantMember({ userType: "Member", userPrincipalName: "guest_example.com#EXT#@contoso.onmicrosoft.com" })).toBe(false);
    expect(isInternalTenantMember({ userType: "Member", userPrincipalName: "guest_example.com#ext#@contoso.onmicrosoft.com" })).toBe(false);
  });
});
