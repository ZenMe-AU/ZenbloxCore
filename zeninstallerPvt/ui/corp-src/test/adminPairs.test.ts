/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { listAdminPairs } from "../api/azureGraph";

vi.mock("../auth/msal", () => ({ getToken: async () => "token" }));

const user = (upn: string, manager?: string) => ({ id: `id-${upn}`, displayName: upn.split("@")[0], userPrincipalName: upn, ...(manager && { manager: { displayName: manager } }) });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("listAdminPairs", () => {
  it("pairs each adm_ account with the account of the same UPN, across pages", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(decodeURIComponent(url));
      if (url.includes("skiptoken")) return json({ value: [user("adm_cat@corp.com")] });
      if (url.includes("startswith")) {
        return json({ value: [user("adm_bob@corp.com", "Ann Admin"), user("adm_lone@corp.com")], "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skiptoken=x" });
      }
      return json({ value: [user("Bob@corp.com", "Ann"), user("cat@corp.com")] });
    }));

    const pairs = await listAdminPairs({ tenantId: "t" } as AccountInfo);

    // adm_lone has no partner, so it isn't listed; UPNs match case-insensitively.
    expect(pairs.map((p) => [p.user.userPrincipalName, p.privileged.userPrincipalName])).toEqual([
      ["Bob@corp.com", "adm_bob@corp.com"],
      ["cat@corp.com", "adm_cat@corp.com"],
    ]);
    expect(pairs[0].user.manager).toBe("Ann");
    expect(pairs[0].privileged.manager).toBe("Ann Admin");
    expect(urls.at(-1)).toContain("userPrincipalName in ('bob@corp.com','lone@corp.com','cat@corp.com')");
  });

  it("refuses a next page outside Graph", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ value: [], "@odata.nextLink": "https://evil.example/users" })));
    await expect(listAdminPairs({ tenantId: "t" } as AccountInfo)).rejects.toThrow("unexpected users URL");
  });
});
