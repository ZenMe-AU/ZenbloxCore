/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { adminRowErrors, duplicateUpns, resolveAdmin, useCreateAdminUsersCard, type AdminRow, type UseCreateAdminUsersCard } from "../cards/CreateAdminUsers/useCreateAdminUsersCard";
import CreateAdminUsersCard from "../cards/CreateAdminUsers/CreateAdminUsersCard";
import { createAdminUsersAccess } from "../cards/CreateAdminUsers/config";
import theme from "../theme";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getGroupByName: vi.fn(),
    createGroup: vi.fn(),
    isGroupMember: vi.fn(),
    addGroupMember: vi.fn(),
    ensureDirectoryRoleAssignment: vi.fn(),
    ensureDirectoryRoleEligibility: vi.fn(),
    ensureFido2Enabled: vi.fn(),
    ensureRbacRoleEligibility: vi.fn(),
    ensureRbacRoleAtScope: vi.fn(),
    getUserByUpn: vi.fn(),
    createUser: vi.fn(),
    getEntraLicence: vi.fn(),
    listVerifiedDomainsViaOrganization: vi.fn(),
    listAdminPairs: vi.fn(),
    getUserManagerId: vi.fn(),
    setUserManager: vi.fn(),
    getSignedInUser: vi.fn(),
    ensureCardResourceAccess: vi.fn(),
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
  ensureFido2Enabled: mocks.ensureFido2Enabled,
  getUserByUpn: mocks.getUserByUpn,
  createUser: mocks.createUser,
  getEntraLicence: mocks.getEntraLicence,
  listVerifiedDomainsViaOrganization: mocks.listVerifiedDomainsViaOrganization,
  listAdminPairs: mocks.listAdminPairs,
  getUserManagerId: mocks.getUserManagerId,
  setUserManager: mocks.setUserManager,
  getSignedInUser: mocks.getSignedInUser,
  searchUsers: vi.fn(),
}));
vi.mock("../hooks/util/useAzureAccessCheck", async (importOriginal) => ({ ...await importOriginal<object>(), ensureCardResourceAccess: mocks.ensureCardResourceAccess }));
vi.mock("../api/azureArm", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/azureArm")>(),
  ensureRbacRoleAtScope: mocks.ensureRbacRoleAtScope,
  ensureRbacRoleEligibility: mocks.ensureRbacRoleEligibility,
}));
vi.mock("../config/azureConfig", async (importOriginal) => ({
  ...await importOriginal<typeof import("../config/azureConfig")>(),
  AZURE_CLIENT_ID: "test-client",
}));
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
    mocks.ensureCardResourceAccess.mockResolvedValue(undefined);
    // Only PrivilegedAccounts is missing; created groups exist from then on.
    const existing = new Set(["PrivilegedAccountApproved", "ResourceGroupDeployer"]);
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
    mocks.ensureFido2Enabled.mockResolvedValue(true);
    mocks.getUserByUpn.mockImplementation(async (_a, upn: string) => (upn === "Ann.Lee@corp.com" ? { id: "u-Ann.Lee@corp.com", userPrincipalName: upn } : null));
    mocks.createUser.mockImplementation(async (_a, params: { userPrincipalName: string }) => ({ id: `u-${params.userPrincipalName}`, userPrincipalName: params.userPrincipalName }));
    mocks.getEntraLicence.mockResolvedValue("p1");
    mocks.listVerifiedDomainsViaOrganization.mockResolvedValue([
      { name: "corp.onmicrosoft.com", isDefault: false, isInitial: true },
      { name: "corp.com", isDefault: true, isInitial: false },
    ]);
    mocks.listAdminPairs.mockResolvedValue([]);
    mocks.getUserManagerId.mockResolvedValue(null);
    mocks.setUserManager.mockResolvedValue(undefined);
    mocks.getSignedInUser.mockResolvedValue({ id: "me", displayName: "Max Ng", userPrincipalName: "max@corp.com" });
  });

  it("shows failed access below Create in prerequisites and recovers after rechecking", async () => {
    mocks.ensureCardResourceAccess.mockRejectedValue(new Error("Missing role assignment access"));
    mocks.getEntraLicence.mockResolvedValue("p2");
    let latest: UseCreateAdminUsersCard | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    function Harness() {
      const value = useCreateAdminUsersCard({ azureAccount: account, tenantId: "tenant-1", subscriptionId: "sub-1" });
      useEffect(() => { latest = value; }, [value]);
      return (
        <ThemeProvider theme={theme}>
          <CreateAdminUsersCard
            card={{ cardId: "create_admin_users", status: value.status, summary: value.summary, locked: false, requirements: [],
              unavailable: false, expanded: true, onToggle: vi.fn(), onRequirementClick: vi.fn() }}
            adminUsers={value}
          />
        </ThemeProvider>
      );
    }
    try {
      await act(async () => root.render(<Harness />));
      await waitFor(() => expect(latest?.access.status).toBe("error"));
      expect(latest?.status).toBe("error");
      expect(latest?.summary).toBe("Insufficient permissions to continue");
      const create = [...container.querySelectorAll("button")].find((button) => button.textContent === "Create groups and admin accounts")!;
      expect(create.disabled).toBe(true);
      expect(create.parentElement?.textContent).toContain("Insufficient permissions to continue");
      const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="create-admin-users-prerequisites"]')!;
      expect(create.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      await act(async () => toggle.click());
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const panel = container.querySelector('#create-admin-users-prerequisites[role="region"]')!;
      expect(panel.textContent).toContain("Missing role assignment access");
      expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Recheck resource access")).toHaveLength(1);
      expect(mocks.ensureCardResourceAccess).toHaveBeenLastCalledWith(account, "sub-1", createAdminUsersAccess(true), "tenant-1");

      mocks.ensureCardResourceAccess.mockResolvedValue(undefined);
      const retry = [...panel.querySelectorAll("button")].find((button) => button.textContent === "Recheck resource access")!;
      await act(async () => retry.click());
      await waitFor(() => expect(latest?.access.status).toBe("ready"));
      expect(latest?.status).not.toBe("error");
      expect(create.parentElement?.textContent).not.toContain("Insufficient permissions to continue");
      expect(container.querySelector('[aria-controls="create-admin-users-prerequisites"]')).toBeNull();
      await act(async () => latest?.setUsePim(false));
      expect(mocks.ensureCardResourceAccess).toHaveBeenLastCalledWith(account, "sub-1", createAdminUsersAccess(false), "tenant-1");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("creates the groups, roles and admin accounts, each with its manager", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.missingGroups).toEqual(["PrivilegedAccounts"]));
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    expect(card.current.primaryDomain).toBe("corp.com");
    // P1 allows the role-assignable group but not PIM.
    expect(card.current.roleTarget).toBe("group");
    act(() => card.current.setUsePim(true));
    expect(card.current.usePim).toBe(false);

    act(() => {
      card.current.updateAdmin(card.current.admins[0].key, {
        givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001",
      });
      card.current.addAdmin();
    });
    const bob = card.current.admins[1].key;
    const ann = card.current.admins[0].key;
    act(() =>
      card.current.updateAdmin(bob, {
        givenName: "Bob", surname: "Wu", mobile: "+61 400 000 002", employeeId: "E002", username: "bob", manager: { kind: "row", key: ann },
      })
    );
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.filter((s) => s.status === "error")).toEqual([]);
    expect(mocks.createGroup).toHaveBeenCalledTimes(1);
    expect(mocks.createGroup.mock.calls[0][1]).toMatchObject({ displayName: "PrivilegedAccounts", isAssignableToRole: true });
    // No group sits in another, so there is no nesting step.
    expect(card.current.steps.map((s) => s.id)).not.toContain("nesting");
    // Passkeys are allowed before the accounts are made.
    expect(card.current.steps.find((s) => s.id === "fido2")).toMatchObject({ status: "done", detail: "Turned on" });
    expect(card.current.steps.findIndex((s) => s.id === "fido2")).toBeLessThan(card.current.steps.findIndex((s) => s.id.startsWith("user:")));
    expect(mocks.addGroupMember.mock.calls.filter((c) => String(c[1]).startsWith("id-") && String(c[2]).startsWith("id-"))).toEqual([]);
    expect(mocks.ensureDirectoryRoleAssignment).toHaveBeenCalledWith(expect.anything(), "id-PrivilegedAccounts", "62e90394-69f5-4237-9190-012177145e10", "tenant-1");
    expect(mocks.ensureRbacRoleAtScope).toHaveBeenCalledWith(
      expect.anything(), "/providers/Microsoft.Management/managementGroups/tenant-1", "id-PrivilegedAccounts", "Owner", "tenant-1", "Group"
    );
    expect(mocks.ensureRbacRoleAtScope).toHaveBeenCalledWith(expect.anything(), "/subscriptions/sub-1", "id-ResourceGroupDeployer", "Owner", "tenant-1", "Group");
    // Ann.Lee already exists, so only her adm_ account is created; Bob gets both.
    expect(mocks.createUser.mock.calls.map((c) => c[1].userPrincipalName)).toEqual(["adm_Ann.Lee@corp.com", "bob@corp.com", "adm_bob@corp.com"]);
    expect(mocks.createUser.mock.calls[0][1]).toMatchObject({ displayName: "Ann Lee Admin", givenName: "Ann", surname: "Lee", mobilePhone: "+61 400 000 001", employeeId: "E001", password: "pw" });
    expect(mocks.createUser.mock.calls[1][1]).toMatchObject({ displayName: "Bob Wu", mobilePhone: "+61 400 000 002", employeeId: "E002" });
    expect(mocks.createUser.mock.calls[2][1]).toMatchObject({ employeeId: "E002" });
    // User accounts join PrivilegedAccountApproved, adm_ accounts PrivilegedAccounts.
    const userJoins = mocks.addGroupMember.mock.calls.filter((c) => String(c[2]).startsWith("u-")).map((c) => [c[1], c[2]]);
    expect(userJoins).toEqual([
      ["id-PrivilegedAccountApproved", "u-Ann.Lee@corp.com"],
      ["id-PrivilegedAccounts", "u-adm_Ann.Lee@corp.com"],
      ["id-PrivilegedAccountApproved", "u-bob@corp.com"],
      ["id-PrivilegedAccounts", "u-adm_bob@corp.com"],
    ]);
    // Each manager is set as the account is made. A user account reports to its pick, by default the signed-in user; an adm_ account always to its user account.
    // Bob picked Ann, so his user account reports to Ann's and his adm_ account to his own.
    expect(mocks.setUserManager.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["u-Ann.Lee@corp.com", "me"],
      ["u-adm_Ann.Lee@corp.com", "u-Ann.Lee@corp.com"],
      ["u-bob@corp.com", "u-Ann.Lee@corp.com"],
      ["u-adm_bob@corp.com", "u-bob@corp.com"],
    ]);
    expect(card.current.steps.find((s) => s.id === `user:${bob}`)?.detail).toBe("Created, manager Ann Lee, member of PrivilegedAccountApproved");
    expect(card.current.steps.map((s) => s.id)).not.toContain("managers");
    await waitFor(() => expect(card.current.done).toBe(true));
  });

  it("gives Global Administrator to each privileged account without Entra ID P1", async () => {
    mocks.getEntraLicence.mockResolvedValue("none");
    const card = renderCard();
    await waitFor(() => expect(card.current.entraLicence).toBe("none"));
    expect(card.current.roleTarget).toBe("users");
    await waitFor(() => expect(card.current.missingGroups).not.toBeNull());
    act(() => card.current.updateAdmin(card.current.admins[0].key, { givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001" }));
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.filter((s) => s.status === "error")).toEqual([]);
    expect(mocks.createGroup.mock.calls[0][1]).toMatchObject({ displayName: "PrivilegedAccounts", isAssignableToRole: false });
    expect(mocks.ensureDirectoryRoleAssignment.mock.calls.map((c) => c[1])).toEqual(["u-adm_Ann.Lee@corp.com"]);
    expect(mocks.ensureRbacRoleAtScope).toHaveBeenCalledWith(
      expect.anything(), "/providers/Microsoft.Management/managementGroups/tenant-1", "id-PrivilegedAccounts", "Owner", "tenant-1", "Group"
    );
    expect(card.current.steps.find((s) => s.id.startsWith("priv:"))?.detail).toBe("Created, manager Ann Lee, member of PrivilegedAccounts, Global Administrator");
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

  it("keeps an existing account's manager and defaults the others to the signed-in user", async () => {
    mocks.getUserManagerId.mockResolvedValue("boss");
    const card = renderCard();
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    act(() => {
      card.current.updateAdmin(card.current.admins[0].key, {
        givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001", manager: { kind: "entra", id: "e1", displayName: "Chris Tan", userPrincipalName: "chris@corp.com" },
      });
      card.current.addAdmin();
    });
    act(() => card.current.updateAdmin(card.current.admins[1].key, { givenName: "Cat", surname: "Ng", mobile: "+61 400 000 003", employeeId: "E003" }));
    await act(async () => {
      await card.current.run();
    });

    // Ann.Lee already exists with a manager, so only the new accounts get one.
    expect(mocks.setUserManager.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["u-adm_Ann.Lee@corp.com", "u-Ann.Lee@corp.com"],
      ["u-Cat.Ng@corp.com", "me"],
      ["u-adm_Cat.Ng@corp.com", "u-Cat.Ng@corp.com"],
    ]);
    expect(card.current.steps.find((s) => s.id === `user:${card.current.admins[0].key}`)?.detail).toBe("Already existed, manager kept, member of PrivilegedAccountApproved");
  });

  it("creates no account whose manager's account failed", async () => {
    mocks.createUser.mockImplementation(async (_a, params: { userPrincipalName: string }) => {
      if (params.userPrincipalName === "Bob.Wu@corp.com") throw new Error("Insufficient privileges");
      return { id: `u-${params.userPrincipalName}`, userPrincipalName: params.userPrincipalName };
    });
    const card = renderCard();
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    const bob = card.current.admins[0].key;
    act(() => {
      card.current.updateAdmin(bob, { givenName: "Bob", surname: "Wu", mobile: "+61 400 000 002", employeeId: "E002" });
      card.current.addAdmin();
    });
    const cat = card.current.admins[1].key;
    act(() => card.current.updateAdmin(cat, { givenName: "Cat", surname: "Ng", mobile: "+61 400 000 003", employeeId: "E003", manager: { kind: "row", key: bob } }));
    await act(async () => {
      await card.current.run();
    });

    expect(mocks.createUser.mock.calls.map((c) => c[1].userPrincipalName)).toEqual(["Bob.Wu@corp.com"]);
    expect(mocks.setUserManager).not.toHaveBeenCalled();
    expect(card.current.steps.find((s) => s.id === `user:${bob}`)).toMatchObject({ status: "error", detail: "Insufficient privileges" });
    expect(card.current.steps.find((s) => s.id === `priv:${bob}`)).toMatchObject({ status: "error", detail: "Not created, because the user account failed" });
    expect(card.current.steps.find((s) => s.id === `user:${cat}`)).toMatchObject({ status: "error", detail: "Not created, because its manager's account failed" });
    expect(card.current.steps.find((s) => s.id === `priv:${cat}`)).toMatchObject({ status: "error", detail: "Not created, because the user account failed" });
  });

  it("warns about a row whose UPN Entra already has, without blocking the run", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.primaryDomain).toBe("corp.com"));
    const key = card.current.admins[0].key;
    act(() => card.current.updateAdmin(key, { givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001" }));
    await waitFor(() => expect(card.current.rowWarnings).toEqual({ [key]: "Already in Entra: Ann.Lee@corp.com. Running reuses this account instead of creating one." }));
    expect(card.current.rowErrors).toEqual({});
    act(() => card.current.updateAdmin(key, { username: "ann2" }));
    expect(card.current.rowWarnings).toEqual({});
  });

  it("creates both accounts on the domain picked for that admin", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.domains).not.toBeNull());
    await waitFor(() => expect(card.current.missingGroups).not.toBeNull());
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    act(() => card.current.updateAdmin(card.current.admins[0].key, { givenName: "Bob", surname: "Wu", mobile: "+61 400 000 002", employeeId: "E002", domain: "corp.onmicrosoft.com" }));
    await act(async () => {
      await card.current.run();
    });

    expect(mocks.createUser.mock.calls.map((c) => c[1].userPrincipalName)).toEqual(["Bob.Wu@corp.onmicrosoft.com", "adm_Bob.Wu@corp.onmicrosoft.com"]);
  });

  it("lists the admins already in Entra and rereads them after a run", async () => {
    const pair = {
      user: { id: "u-dan", displayName: "Dan Ho", userPrincipalName: "Dan.Ho@corp.com", manager: null, managerId: null, employeeId: "E9" },
      privileged: { id: "u-adm-dan", displayName: "Dan Ho Admin", userPrincipalName: "adm_Dan.Ho@corp.com", manager: "Dan Ho", managerId: "u-dan", employeeId: "E9" },
    };
    mocks.listAdminPairs.mockResolvedValue([pair]);
    const card = renderCard();
    await waitFor(() => expect(card.current.existingAdmins).toEqual([pair]));
    act(() => card.current.removeAdmin(card.current.admins[0].key));
    await act(async () => {
      await card.current.run();
    });
    await waitFor(() => expect(mocks.listAdminPairs).toHaveBeenCalledTimes(2));
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

  it("still creates the accounts when passkeys can't be allowed, and skips it when they already are", async () => {
    mocks.ensureFido2Enabled.mockRejectedValueOnce(new Error("403 Forbidden"));
    const card = renderCard();
    await waitFor(() => expect(card.current.primaryDomain).toBe("corp.com"));
    act(() => card.current.updateAdmin(card.current.admins[0].key, { givenName: "Bob", surname: "Wu", mobile: "+61 400 000 002", employeeId: "E002" }));
    await act(async () => {
      await card.current.run();
    });
    expect(card.current.steps.find((s) => s.id === "fido2")).toMatchObject({ status: "error", detail: "403 Forbidden" });
    expect(card.current.steps.filter((s) => s.id.startsWith("user:") || s.id.startsWith("priv:")).map((s) => s.status)).toEqual(["done", "done"]);

    mocks.ensureFido2Enabled.mockResolvedValueOnce(false);
    await act(async () => {
      await card.current.run();
    });
    expect(card.current.steps.find((s) => s.id === "fido2")).toMatchObject({ status: "skipped", detail: "Already on" });
  });

  it("asks for consent when the licence can't be read without it, and shows any other reason", async () => {
    mocks.getEntraLicence.mockRejectedValueOnce(new Error("AADSTS65001: consent_required"));
    const card = renderCard();
    await waitFor(() => expect(card.current.entraLicence).toBe("unknown"));
    expect(card.current.consentRequired).toBe(true);
    expect(card.current.licenceError).toBeNull();
    act(() => card.current.updateAdmin(card.current.admins[0].key, { givenName: "Bob", surname: "Wu", mobile: "+61 400 000 002", employeeId: "E002" }));
    expect(card.current.canRun).toBe(false);

    mocks.getEntraLicence.mockRejectedValueOnce(new Error("403 Forbidden"));
    const other = renderCard();
    await waitFor(() => expect(other.current.entraLicence).toBe("unknown"));
    expect(other.current.licenceError).toBe("403 Forbidden");
  });
});

describe("resolveAdmin", () => {
  const row = (patch: Partial<AdminRow>): AdminRow => ({
    key: "1", givenName: "", surname: "", mobile: "", employeeId: "", displayName: null, username: null, domain: null, manager: null, ...patch,
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
    key, givenName: "A", surname: "B", mobile: "+61 400 000 000", employeeId: `E${key}`, displayName: null, username, domain: null, manager: null, ...patch,
  });

  it("flags missing names, missing or bad mobiles, missing employee IDs, bad UPNs, and duplicates", () => {
    expect(adminRowErrors([row("1", "ann", { givenName: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { mobile: "abc" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { manager: { kind: "row", key: "gone" } })])).toEqual({ "1": "Pick another manager; that user was removed." });
    expect(adminRowErrors([row("1", "ann", { employeeId: " " })])).toEqual({ "1": "Enter the employee ID." });
    expect(adminRowErrors([row("1", "ann", { employeeId: "e7" }), row("2", "bob", { employeeId: "E7 " })])).toEqual({ 2: "Each admin needs their own employee ID." });
    expect(adminRowErrors([row("1", "ann", { mobile: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { displayName: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", ".ann")])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann@corp.com")])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "Ann.Lee"), row("2", "ann.lee")])).toEqual({ 2: "User 1 already uses ann.lee; each account needs its own UPN." });
    expect(adminRowErrors([row("1", "bob"), row("2", "adm_bob")])).toEqual({ 2: "User 1 already uses adm_bob; each account needs its own UPN." });
    expect(duplicateUpns([row("1", "bob"), row("2", "ann"), row("3", "adm_bob")])).toEqual({ 3: { upn: "adm_bob", row: 1 } });
    expect(duplicateUpns([row("1", ""), row("2", "")])).toEqual({});
    expect(adminRowErrors([row("1", "ann.lee"), row("2", "bob_wu-2")])).toEqual({});
  });

  it("blocks an employee ID an existing admin has, except a rerun for that admin", () => {
    const dan = { id: "u", displayName: "Dan Ho", userPrincipalName: "Dan.Ho@corp.com", manager: null, managerId: null, employeeId: "E9" };
    const existing = [{ user: dan, privileged: { ...dan, id: "p", userPrincipalName: "adm_Dan.Ho@corp.com" } }];
    expect(adminRowErrors([row("1", "ann", { employeeId: "e9 " })], existing, "corp.com")).toEqual({ 1: "Employee ID e9 belongs to Dan.Ho@corp.com, an existing admin." });
    expect(adminRowErrors([row("1", "dan.ho", { employeeId: "E9" })], existing, "corp.com")).toEqual({});
  });
});
