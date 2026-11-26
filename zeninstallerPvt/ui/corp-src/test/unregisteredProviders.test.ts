/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { listUnregisteredProviders } from "../api/azureArm";

vi.mock("../auth/msal", () => ({ getToken: async () => "token" }));

afterEach(() => vi.unstubAllGlobals());

it("lists unregistered providers across pages, ignoring case and skipping ones the cloud doesn't offer", async () => {
  const pages: Record<string, unknown> = {
    first: { value: [{ namespace: "Microsoft.Storage", registrationState: "Registered" }], nextLink: "https://management.azure.com/next?page=2" },
    next: { value: [{ namespace: "microsoft.consumption", registrationState: "NotRegistered" }] },
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/next") ? pages.next : pages.first), { status: 200 })));
  await expect(listUnregisteredProviders({ tenantId: "t" } as AccountInfo, "s", ["Microsoft.Storage", "Microsoft.Consumption", "Microsoft.AVS"]))
    .resolves.toEqual(["Microsoft.Consumption"]);
});
