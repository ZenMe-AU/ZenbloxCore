/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { adminRowErrors, resolveAdmin, useCreateAdminUsersCard, type AdminRow, type UseCreateAdminUsersCard } from "../cards/CreateAdminUsers/useCreateAdminUsersCard";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getGroupByName: vi.fn(),
    createGroup: vi.fn(),
    isGroupMember: vi.fn(),
    addGroupMember: vi.fn(),
    ensureDirectoryRoleAssignment: vi.fn(),
    ensureDirectoryRoleEligibility: vi.fn(),
    ensureRbacRoleEligibility: vi.fn(),
    ensureRbacRoleAtScope: vi.fn(),
    getUserByUpn: vi.fn(),
    createUser: vi.fn(),
    getEntraLicence: vi.fn(),
    getUserManagerId: vi.fn(),
    setUserManager: vi.fn(),
  },
}));

vi.mock("../auth/msal", () => ({ getMsal: vi.fn() }));
vi.mock("../api/azureGraph", () => ({
  getGroupByName: mocks.getGroupByName,
  createGroup: mocks.createGroup,
  isGroupMember: mocks.isGroupMember,
  addGroupMember: mocks.addGroupMember,
  ensureDirectoryRoleAssignment: mocks.ensureDirectoryRoleAssignment,
  ensureDirectoryRoleEligibility: mocks.ensureDirectoryRoleEligibility,
  getUserByUpn: mocks.getUserByUpn,
  createUser: mocks.createUser,
  getEntraLicence: mocks.getEntraLicence,
  getUserManagerId: mocks.getUserManagerId,
  setUserManager: mocks.setUserManager,
  searchUsers: vi.fn(),
}));
vi.mock("../api/azureArm", () => ({ ensureRbacRoleAtScope: mocks.ensureRbacRoleAtScope, ensureRbacRoleEligibility: mocks.ensureRbacRoleEligibility }));
vi.mock("../hooks/util/useCardResourceAccess", () => ({ useCardResourceAccess: () => ({ status: "ready" }) }));
vi.mock("../logic/password", () => ({ generateRandomPassword: () => "pw" }));

async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start >= timeoutMs) throw error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
}

const account = { tenantId: "tenant-1", homeAccountId: "home-1" } as AccountInfo;

function renderCard() {
  let latest: UseCreateAdminUsersCard | null = null;
  function Harness() {
    const value = useCreateAdminUsersCard({
      azureAccount: account,
      tenantId: "tenant-1",
      subscriptionId: "sub-1",
      dnsName: "corp.com",
    });
    useEffect(() => {
      latest = value;
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
  return {
    get current(): UseCreateAdminUsersCard {
      if (!latest) throw new Error("Hook result not ready");
      return latest;
    },
  };
}

describe("useCreateAdminUsersCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Only PrivilegedAccounts is missing; created groups exist from then on.
    const existing = new Set(["PawUsers", "DbAdmin-Dev", "DbAdmin-Test", "DbAdmin-Prod", "ResourceGroupDeployer", "LeadDeveloper"]);
    mocks.getGroupByName.mockImplementation(async (_a, name: string) => (existing.has(name) ? { id: `id-${name}`, displayName: name, description: "" } : null));
    mocks.createGroup.mockImplementation(async (_a, params: { displayName: string }) => {
      existing.add(params.displayName);
      return { id: `id-${params.displayName}`, displayName: params.displayName, description: "" };
    });
    mocks.isGroupMember.mockResolvedValue(false);
    mocks.addGroupMember.mockResolvedValue(undefined);
    mocks.ensureDirectoryRoleAssignment.mockResolvedValue("created");
    mocks.ensureRbacRoleAtScope.mockResolvedValue("exists");
    mocks.ensureDirectoryRoleEligibility.mockResolvedValue("created");
    mocks.ensureRbacRoleEligibility.mockResolvedValue("created");
    mocks.getUserByUpn.mockImplementation(async (_a, upn: string) => (upn === "Ann.Lee@corp.com" ? { id: "u-Ann.Lee@corp.com", userPrincipalName: upn } : null));
    mocks.createUser.mockImplementation(async (_a, params: { userPrincipalName: string }) => ({ id: `u-${params.userPrincipalName}`, userPrincipalName: params.userPrincipalName }));
    mocks.getEntraLicence.mockResolvedValue("p1");
    mocks.getUserManagerId.mockResolvedValue(null);
    mocks.setUserManager.mockResolvedValue(undefined);
  });

  it("creates the groups, nesting, roles and admin accounts", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.missingGroups).toEqual(["PrivilegedAccounts"]));
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    // P1 allows the role-assignable group but not PIM.
    expect(card.current.roleTarget).toBe("group");
    act(() => card.current.setUsePim(true));
    expect(card.current.usePim).toBe(false);

    act(() => {
      card.current.updateAdmin(card.current.admins[0].key, {
        givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", userGroups: ["LeadDeveloper"],
      });
      card.current.addAdmin();
    });
    const bob = card.current.admins[1].key;
    const ann = card.current.admins[0].key;
    act(() => card.current.updateAdmin(bob, { givenName: "Bob", surname: "Wu", username: "bob", manager: { kind: "row", key: ann } }));
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.filter((s) => s.status === "error")).toEqual([]);
    expect(mocks.createGroup).toHaveBeenCalledTimes(1);
    expect(mocks.createGroup.mock.calls[0][1]).toMatchObject({ displayName: "PrivilegedAccounts", isAssignableToRole: true });
    expect(mocks.addGroupMember).toHaveBeenCalledWith(expect.anything(), "id-PawUsers", "id-PrivilegedAccounts", "tenant-1");
    expect(mocks.addGroupMember).toHaveBeenCalledWith(expect.anything(), "id-ResourceGroupDeployer", "id-LeadDeveloper", "tenant-1");
    expect(mocks.ensureDirectoryRoleAssignment).toHaveBeenCalledWith(expect.anything(), "id-PrivilegedAccounts", "62e90394-69f5-4237-9190-012177145e10", "tenant-1");
    expect(mocks.ensureRbacRoleAtScope).toHaveBeenCalledWith(
      expect.anything(), "/providers/Microsoft.Management/managementGroups/tenant-1", "id-PrivilegedAccounts", "Owner", "tenant-1", "Group"
    );
    expect(mocks.ensureRbacRoleAtScope).toHaveBeenCalledWith(expect.anything(), "/subscriptions/sub-1", "id-ResourceGroupDeployer", "Owner", "tenant-1", "Group");
    // Ann.Lee already exists, so only her adm_ account is created; Bob gets both, without a mobile.
    expect(mocks.createUser.mock.calls.map((c) => c[1].userPrincipalName)).toEqual(["adm_Ann.Lee@corp.com", "bob@corp.com", "adm_bob@corp.com"]);
    expect(mocks.createUser.mock.calls[0][1]).toMatchObject({ displayName: "Ann Lee Admin", givenName: "Ann", surname: "Lee", mobilePhone: "+61 400 000 001", password: "pw" });
    expect(mocks.createUser.mock.calls[1][1]).toMatchObject({ displayName: "Bob Wu", mobilePhone: undefined });
    // Each account joins its own ticked groups.
    const userJoins = mocks.addGroupMember.mock.calls.filter((c) => String(c[2]).startsWith("u-")).map((c) => [c[1], c[2]]);
    expect(userJoins).toEqual([
      ["id-LeadDeveloper", "u-Ann.Lee@corp.com"],
      ["id-PrivilegedAccounts", "u-adm_Ann.Lee@corp.com"],
      ["id-PrivilegedAccounts", "u-adm_bob@corp.com"],
    ]);
    // Bob reports to Ann, who has no manager by default; adm_ accounts get none.
    expect(mocks.setUserManager.mock.calls.map((c) => [c[1], c[2]])).toEqual([["u-bob@corp.com", "u-Ann.Lee@corp.com"]]);
    expect(card.current.steps.find((s) => s.id === "managers")).toMatchObject({ status: "done", detail: "Set for 1 user" });
    await waitFor(() => expect(card.current.done).toBe(true));
  });

  it("gives Global Administrator to each privileged account without Entra ID P1", async () => {
    mocks.getEntraLicence.mockResolvedValue("none");
    const card = renderCard();
    await waitFor(() => expect(card.current.entraLicence).toBe("none"));
    expect(card.current.roleTarget).toBe("users");
    await waitFor(() => expect(card.current.missingGroups).not.toBeNull());
    act(() => card.current.updateAdmin(card.current.admins[0].key, { givenName: "Ann", surname: "Lee" }));
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.filter((s) => s.status === "error")).toEqual([]);
    expect(mocks.createGroup.mock.calls[0][1]).toMatchObject({ displayName: "PrivilegedAccounts", isAssignableToRole: false });
    expect(mocks.ensureDirectoryRoleAssignment.mock.calls.map((c) => c[1])).toEqual(["u-adm_Ann.Lee@corp.com"]);
    expect(mocks.ensureRbacRoleAtScope).toHaveBeenCalledWith(
      expect.anything(), "/providers/Microsoft.Management/managementGroups/tenant-1", "id-PrivilegedAccounts", "Owner", "tenant-1", "Group"
    );
    expect(card.current.steps.find((s) => s.id.startsWith("priv:"))?.detail).toBe("Created, member of PrivilegedAccounts, Global Administrator");
  });

  it("makes PrivilegedAccounts eligible through PIM with Entra ID P2", async () => {
    mocks.getEntraLicence.mockResolvedValue("p2");
    const card = renderCard();
    await waitFor(() => expect(card.current.entraLicence).toBe("p2"));
    expect(card.current.roleTarget).toBe("group");
    expect(card.current.usePim).toBe(true);
    await waitFor(() => expect(card.current.missingGroups).not.toBeNull());
    act(() => card.current.removeAdmin(card.current.admins[0].key));
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.filter((s) => s.status === "error")).toEqual([]);
    expect(mocks.createGroup.mock.calls[0][1]).toMatchObject({ displayName: "PrivilegedAccounts", isAssignableToRole: true });
    expect(mocks.ensureDirectoryRoleAssignment).not.toHaveBeenCalled();
    expect(mocks.ensureDirectoryRoleEligibility).toHaveBeenCalledWith(expect.anything(), "id-PrivilegedAccounts", "62e90394-69f5-4237-9190-012177145e10", "tenant-1");
    expect(mocks.ensureRbacRoleEligibility).toHaveBeenCalledWith(
      expect.anything(), "/providers/Microsoft.Management/managementGroups/tenant-1", "id-PrivilegedAccounts", "Owner", "tenant-1"
    );
    // ResourceGroupDeployer's subscription Owner stays active.
    expect(mocks.ensureRbacRoleAtScope.mock.calls.map((c) => c[1])).toEqual(["/subscriptions/sub-1"]);
  });

  it("skips the privileged account when it isn't ticked", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.missingGroups).not.toBeNull());
    const key = card.current.admins[0].key;
    act(() => card.current.updateAdmin(key, { givenName: "Bob", surname: "Wu", privileged: false }));
    await act(async () => {
      await card.current.run();
    });

    expect(mocks.createUser.mock.calls.map((c) => c[1].userPrincipalName)).toEqual(["Bob.Wu@corp.com"]);
    expect(card.current.steps.some((s) => s.id === `priv:${key}`)).toBe(false);
  });

  it("keeps an existing manager and skips users without one", async () => {
    mocks.getUserManagerId.mockResolvedValue("boss");
    const card = renderCard();
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    await waitFor(() => expect(card.current.missingGroups).not.toBeNull());
    act(() => {
      card.current.updateAdmin(card.current.admins[0].key, {
        givenName: "Ann", surname: "Lee", privileged: false, manager: { kind: "entra", id: "e1", displayName: "Chris Tan", userPrincipalName: "chris@corp.com" },
      });
      card.current.addAdmin();
    });
    act(() => card.current.updateAdmin(card.current.admins[1].key, { givenName: "Cat", surname: "Ng", privileged: false, manager: null }));
    await act(async () => {
      await card.current.run();
    });

    expect(mocks.setUserManager).not.toHaveBeenCalled();
    expect(card.current.steps.find((s) => s.id === "managers")).toMatchObject({ status: "skipped", detail: "Already set" });
  });

  it("stops after the groups step when a group can't be created", async () => {
    mocks.createGroup.mockRejectedValueOnce(new Error("Insufficient privileges"));
    const card = renderCard();
    await waitFor(() => expect(card.current.missingGroups).not.toBeNull());
    act(() => card.current.removeAdmin(card.current.admins[0].key));
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.find((s) => s.id === "groups")).toMatchObject({ status: "error", detail: "Insufficient privileges" });
    expect(card.current.steps.filter((s) => s.id !== "groups").every((s) => s.status === "pending")).toBe(true);
    expect(mocks.ensureDirectoryRoleAssignment).not.toHaveBeenCalled();
  });

  it("asks for consent when the licence can't be read without it, and shows any other reason", async () => {
    mocks.getEntraLicence.mockRejectedValueOnce(new Error("AADSTS65001: consent_required"));
    const card = renderCard();
    await waitFor(() => expect(card.current.entraLicence).toBe("unknown"));
    expect(card.current.consentRequired).toBe(true);
    expect(card.current.licenceError).toBeNull();
    act(() => card.current.updateAdmin(card.current.admins[0].key, { givenName: "Bob", surname: "Wu" }));
    expect(card.current.canRun).toBe(false);

    mocks.getEntraLicence.mockRejectedValueOnce(new Error("403 Forbidden"));
    const other = renderCard();
    await waitFor(() => expect(other.current.entraLicence).toBe("unknown"));
    expect(other.current.licenceError).toBe("403 Forbidden");
  });
});

describe("resolveAdmin", () => {
  const row = (patch: Partial<AdminRow>): AdminRow => ({
    key: "1", givenName: "", surname: "", mobile: "", displayName: null, username: null, userGroups: [], privileged: true, privilegedGroups: [], manager: null, ...patch,
  });

  it("defaults the display name, UPN and privileged account from the legal names", () => {
    expect(resolveAdmin(row({ givenName: " Ann ", surname: "Lee" }))).toEqual({
      displayName: "Ann Lee", username: "Ann.Lee", privilegedUsername: "adm_Ann.Lee", privilegedDisplayName: "Ann Lee Admin",
    });
    expect(resolveAdmin(row({ givenName: "José", surname: "de la Cruz" })).username).toBe("Jose.de.la.Cruz");
    expect(resolveAdmin(row({ givenName: "Ann", surname: "Lee", displayName: "Annie Lee" }))).toEqual({
      displayName: "Annie Lee", username: "Annie.Lee", privilegedUsername: "adm_Annie.Lee", privilegedDisplayName: "Annie Lee Admin",
    });
    expect(resolveAdmin(row({ givenName: "Ann", surname: "Lee", username: "ann" }))).toMatchObject({ username: "ann", privilegedUsername: "adm_ann" });
  });
});

describe("adminRowErrors", () => {
  const row = (key: string, username: string, patch: Partial<AdminRow> = {}): AdminRow => ({
    key, givenName: "A", surname: "B", mobile: "+61 400 000 000", displayName: null, username, userGroups: [], privileged: true, privilegedGroups: [], manager: null, ...patch,
  });

  it("flags missing names, bad mobiles, bad UPNs, and duplicates", () => {
    expect(adminRowErrors([row("1", "ann", { givenName: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { mobile: "abc" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { manager: { kind: "row", key: "gone" } })])).toEqual({ "1": "Pick another manager; that user was removed." });
    expect(adminRowErrors([row("1", "ann", { mobile: "" })])).toEqual({});
    expect(adminRowErrors([row("1", "ann", { displayName: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", ".ann")])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann@corp.com")])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "Ann.Lee"), row("2", "ann.lee")])).toEqual({ 2: "Each account needs its own UPN." });
    expect(adminRowErrors([row("1", "bob"), row("2", "adm_bob")])).toEqual({ 2: "Each account needs its own UPN." });
    // An unticked privileged account isn't created, so it can't clash.
    expect(adminRowErrors([row("1", "bob", { privileged: false }), row("2", "adm_bob", { privileged: false })])).toEqual({});
    expect(adminRowErrors([row("1", "ann.lee"), row("2", "bob_wu-2")])).toEqual({});
  });
});
