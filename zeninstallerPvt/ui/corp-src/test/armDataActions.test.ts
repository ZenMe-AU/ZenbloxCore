/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { ensureManagementAccess } from "../api/azureArm";

vi.mock("../auth/msal", () => ({ getToken: async () => "token" }));

const account = { tenantId: "t" } as AccountInfo;
const WPS = "/subscriptions/s/resourceGroups/rg/providers/Microsoft.SignalRService/webPubSub/w";
const ENTITY_READ = "Microsoft.Storage/storageAccounts/tableServices/tables/entities/read";

describe("ensureManagementAccess data actions", () => {
  it("passes when a wildcard data action covers the requirement", async () => {
    const read = async () => [{ actions: [], dataActions: ["Microsoft.SignalRService/WebPubSub/*"] }];
    await expect(ensureManagementAccess(account, [{ scope: WPS, actions: [], dataActions: ["Microsoft.SignalRService/WebPubSub/*"] }], undefined, read)).resolves.toBeUndefined();
  });

  it("doesn't count a management action as a data action", async () => {
    // Owner: every management action, no data actions.
    const read = async () => [{ actions: ["*"], notActions: [] }];
    await expect(ensureManagementAccess(account, [{ scope: WPS, actions: ["Microsoft.SignalRService/webPubSub/read"], dataActions: [ENTITY_READ] }], undefined, read))
      .rejects.toThrow(`Azure access required at ${WPS}\n\nMissing data permissions: ${ENTITY_READ}`);
  });

  it("lets notDataActions exclude an action", async () => {
    const read = async () => [{ actions: [], dataActions: ["Microsoft.Storage/*"], notDataActions: [ENTITY_READ] }];
    await expect(ensureManagementAccess(account, [{ scope: WPS, actions: [], dataActions: [ENTITY_READ] }], undefined, read)).rejects.toThrow("Missing data permissions");
  });
});
