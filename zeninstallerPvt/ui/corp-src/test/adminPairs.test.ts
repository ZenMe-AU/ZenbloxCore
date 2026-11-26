/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { listAdminPairs } from "../api/azureGraph";

vi.mock("../auth/msal", () => ({ getToken: async () => "token" }));

// manager is the manager's UPN.
const user = (upn: string, employeeId?: string, manager?: string) => ({
  id: `id-${upn}`, displayName: upn.split("@")[0], userPrincipalName: upn, employeeId: employeeId ?? null, ...(manager && { manager: { id: `id-${manager}`, displayName: manager.split("@")[0] } }),
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const groups = { user: ["PrivilegedAccountApproved"], privileged: ["PrivilegedAccounts"] };

afterEach(() => vi.unstubAllGlobals());

// Each account's groups; checkMemberGroups answers from this.
function stubGraph(memberOf: Record<string, string[]>, privileged: unknown[], users: unknown[], urls: string[] = []) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = decodeURIComponent(url);
    urls.push(path);
    const group = path.match(/displayName eq '([^']+)'/)?.[1];
    if (group) return json({ value: [{ id: `g-${group}`, displayName: group }] });
    const member = path.match(/directoryObjects\/([^/]+)\/checkMemberGroups/)?.[1];
    if (member) {
      const asked: string[] = JSON.parse(String(init?.body)).groupIds;
      return json({ value: asked.filter((id) => (memberOf[member] ?? []).includes(id.slice(2))) });
    }
    if (path.includes("skiptoken")) return json({ value: privileged.slice(1) });
    if (path.includes("startswith")) return json({ value: privileged.slice(0, 1), "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skiptoken=x" });
    return json({ value: users });
  }));
}

describe("listAdminPairs", () => {
  it("pairs an adm_ account with its manager when both have the same employee ID and their groups, across pages", async () => {
    const urls: string[] = [];
    stubGraph(
      {
        "id-adm_bob@corp.com": ["PrivilegedAccounts"],
        "id-adm_cat@corp.com": ["PrivilegedAccounts"],
        "id-adm_lone@corp.com": ["PrivilegedAccounts"],
        "id-adm_eve@corp.com": ["PrivilegedAccounts"],
        "id-eve@corp.com": ["PrivilegedAccountApproved"],
        "id-Bob@corp.com": ["PrivilegedAccountApproved"],
        "id-cathy@corp.com": ["PrivilegedAccountApproved"],
      },
      [user("adm_bob@corp.com", "E2", "Bob@corp.com"), user("adm_cat@corp.com", "e3", "cathy@corp.com"), user("adm_lone@corp.com", "E4", "dan@corp.com"), user("adm_noid@corp.com", undefined, "Bob@corp.com"), user("adm_out@corp.com", "E5", "Bob@corp.com"), user("adm_eve@corp.com", "E6", "Bob@corp.com")],
      // adm_bob comes back too, having the same employee ID; dan isn't in PrivilegedAccountApproved.
      [user("Bob@corp.com", "E2", "ann@corp.com"), user("adm_bob@corp.com", "E2"), user("cathy@corp.com", "E3"), user("dan@corp.com", "E4"), user("eve@corp.com", "E6")]
    , urls);

    const pairs = await listAdminPairs({ tenantId: "t" } as AccountInfo, groups);

    // The UPNs needn't match. adm_lone's manager isn't in PrivilegedAccountApproved, adm_noid has no employee ID,
    // adm_out isn't in PrivilegedAccounts, and adm_eve's manager isn't eve.
    expect(pairs.map((p) => [p.user.userPrincipalName, p.privileged.userPrincipalName])).toEqual([
      ["Bob@corp.com", "adm_bob@corp.com"],
      ["cathy@corp.com", "adm_cat@corp.com"],
    ]);
    expect(pairs[0].user.manager).toBe("ann");
    expect(pairs[0].privileged.manager).toBe("Bob");
    expect(urls.filter((u) => u.includes("employeeId in"))).toEqual([expect.stringContaining("employeeId in ('E2','e3','E4','E6')")]);
  });

  it("pairs nobody while a group doesn't exist", async () => {
    stubGraph({ "id-adm_bob@corp.com": ["PrivilegedAccounts"], "id-Bob@corp.com": ["PrivilegedAccountApproved"] }, [user("adm_bob@corp.com", "E2", "Bob@corp.com")], [user("Bob@corp.com", "E2")]);
    const fetch = vi.mocked(globalThis.fetch);
    const answer = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => (decodeURIComponent(String(url)).includes("PrivilegedAccountApproved") ? json({ value: [] }) : answer(url, init)));
    await expect(listAdminPairs({ tenantId: "t" } as AccountInfo, groups)).resolves.toEqual([]);
  });

  it("refuses a next page outside Graph", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ value: [], "@odata.nextLink": "https://evil.example/users" })));
    await expect(listAdminPairs({ tenantId: "t" } as AccountInfo, groups)).rejects.toThrow("unexpected users URL");
  });
});
