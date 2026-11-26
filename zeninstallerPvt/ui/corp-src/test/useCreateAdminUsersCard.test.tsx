/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { useCreateAdminUsersCard, type UseCreateAdminUsersCard } from "../cards/CreateAdminUsers/useCreateAdminUsersCard";
import { adminRowErrors, adminRowIssues, byManager, duplicateUpns, issueHeadline, managerLoop, newAdmin, resolveAdmin, type AdminRow } from "../cards/CreateAdminUsers/logic";
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
    updateUser: vi.fn(),
    listUsersByEmployeeId: vi.fn(),
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
  updateUser: mocks.updateUser,
  listUsersByEmployeeId: mocks.listUsersByEmployeeId,
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
    vi.useRealTimers(); // A test that fails with fake timers on would leave them on.
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
    mocks.getUserByUpn.mockImplementation(async (_a, upn: string) => (upn === "Ann.Lee@corp.com" ? { id: "u-Ann.Lee@corp.com", displayName: "Ann Lee", userPrincipalName: upn, employeeId: null } : null));
    mocks.createUser.mockImplementation(async (_a, params: { userPrincipalName: string }) => ({ id: `u-${params.userPrincipalName}`, userPrincipalName: params.userPrincipalName }));
    mocks.getEntraLicence.mockResolvedValue("p1");
    mocks.listVerifiedDomainsViaOrganization.mockResolvedValue([
      { name: "corp.onmicrosoft.com", isDefault: false, isInitial: true },
      { name: "corp.com", isDefault: true, isInitial: false },
    ]);
    mocks.listAdminPairs.mockResolvedValue([]);
    mocks.getUserManagerId.mockResolvedValue(null);
    mocks.setUserManager.mockResolvedValue(undefined);
    mocks.updateUser.mockResolvedValue(undefined);
    mocks.listUsersByEmployeeId.mockResolvedValue([]);
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

  it("keeps a new row's empty fields quiet until the operator leaves one", async () => {
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
      await waitFor(() => expect(latest?.primaryDomain).toBe("corp.com"));
      const header = container.querySelector(`[aria-controls="admin-user-${latest!.admins[0].key}"]`)!;
      // Nothing typed yet: not started; beside Create, why it can't run.
      const note = () => container.querySelector('[role="note"]')?.textContent;
      expect(header.textContent).toContain("Not started");
      expect(note()).toBe("1 incomplete");
      const label = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("First name"))!;
      const firstName = document.getElementById(label.htmlFor) as HTMLInputElement;
      expect(firstName.getAttribute("aria-invalid")).toBe("false");
      await act(async () => firstName.focus());
      await act(async () => firstName.blur());
      expect(header.textContent).toContain("First name missing");
      expect(header.textContent).not.toContain("Not started");
      expect(firstName.getAttribute("aria-invalid")).toBe("true");
      // The red field is enough; the opened row doesn't spell it out.
      expect(container.querySelector(`#admin-user-${latest!.admins[0].key}`)?.textContent).not.toContain("Enter the first name.");
      // The surname wasn't left yet, so it stays quiet.
      expect(header.textContent).not.toContain("Surname missing");
      // Another row in the way: the note counts it.
      await act(async () => { latest!.addAdmin(); });
      expect(note()).toBe("2 incomplete");
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
        givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001", confirmedAccountIds: ["u-Ann.Lee@corp.com"],
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
    act(() => card.current.updateAdmin(card.current.admins[0].key, { givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001", confirmedAccountIds: ["u-Ann.Lee@corp.com"] }));
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

  it("keeps an existing account's manager, defaults the others to the signed-in user, and moves the done admins out of the list to add", async () => {
    mocks.getUserManagerId.mockResolvedValue("boss");
    // Ann's user account has no employee ID yet; her adm_ account has one.
    mocks.getUserByUpn.mockImplementation(async (_a, upn: string) =>
      /^(adm_)?Ann\.Lee@corp\.com$/.test(upn) ? { id: `u-${upn}`, displayName: upn, userPrincipalName: upn, employeeId: upn.startsWith("adm_") ? "E001" : null } : null);
    const card = renderCard();
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    act(() => {
      card.current.updateAdmin(card.current.admins[0].key, {
        givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001", manager: { kind: "entra", id: "e1", displayName: "Chris Tan", userPrincipalName: "chris@corp.com" },
        confirmedAccountIds: ["u-Ann.Lee@corp.com", "u-adm_Ann.Lee@corp.com"],
      });
      card.current.addAdmin();
    });
    act(() => card.current.updateAdmin(card.current.admins[1].key, { givenName: "Cat", surname: "Ng", mobile: "+61 400 000 003", employeeId: "E003" }));
    const ann = card.current.admins[0].key;
    // The read after the run lists Ann, but Entra doesn't list Cat yet.
    const annAccount = { id: "u-Ann.Lee@corp.com", displayName: "Ann Lee", userPrincipalName: "Ann.Lee@corp.com", manager: "Chris Tan", managerId: "e1", employeeId: "E001" };
    mocks.listAdminPairs.mockResolvedValue([{ user: annAccount, privileged: { ...annAccount, id: "u-adm_Ann.Lee@corp.com", userPrincipalName: "adm_Ann.Lee@corp.com", manager: "Ann Lee", managerId: annAccount.id } }]);
    await act(async () => {
      await card.current.run();
    });

    // Ann.Lee keeps her manager; her existing adm_ account is set back to her user account, or Entra can't pair them.
    expect(mocks.setUserManager.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["u-adm_Ann.Lee@corp.com", "u-Ann.Lee@corp.com"],
      ["u-Cat.Ng@corp.com", "me"],
      ["u-adm_Cat.Ng@corp.com", "u-Cat.Ng@corp.com"],
    ]);
    expect(card.current.steps.find((step) => step.id === `user:${ann}`)?.detail).toBe("Already existed, manager kept, member of PrivilegedAccountApproved, employee ID E001 added");
    expect(mocks.createUser.mock.calls.map((call) => call[1].userPrincipalName)).toEqual(["Cat.Ng@corp.com", "adm_Cat.Ng@corp.com"]);
    expect(mocks.updateUser.mock.calls.map((call) => [call[1], call[2]])).toEqual([["u-Ann.Lee@corp.com", { employeeId: "E001" }]]);
    // Both admins are done, so they leave the list to add and wait, read-only, until Entra lists them.
    expect(card.current.admins).toEqual([]);
    await waitFor(() => expect(card.current.existingAdmins?.map((pair) => pair.user.userPrincipalName)).toEqual(["Ann.Lee@corp.com"]));
    expect(card.current.waitingAdmins.map((createdAdmin) => [createdAdmin.user.userPrincipalName, createdAdmin.privileged.userPrincipalName])).toEqual([["Cat.Ng@corp.com", "adm_Cat.Ng@corp.com"]]);

    // Cat counts as existing while she waits: the manager picker lists her, and her employee ID is taken.
    expect(card.current.existingAndWaitingAdmins.map((pair) => pair.user.userPrincipalName)).toEqual(["Ann.Lee@corp.com", "Cat.Ng@corp.com"]);
    let dan = "";
    act(() => {
      dan = card.current.addAdmin();
    });
    act(() => card.current.updateAdmin(dan, { givenName: "Dan", surname: "Ho", mobile: "+61 400 000 004", employeeId: "E003" }));
    expect(card.current.rowErrors[dan]).toBe("Employee ID E003 is associated with Cat.Ng@corp.com, which already has a Privileged Account. Enter a different Employee ID, or remove this entry if it refers to the same person.");
  });

  it("reads Entra again after a run, then marks the admins it still doesn't list, and Recheck reads again", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    const bob = card.current.admins[0].key;
    act(() => {
      card.current.updateAdmin(bob, { givenName: "Bob", surname: "Wu", mobile: "+61 400 000 002", employeeId: "E002" });
      card.current.addAdmin();
    });
    const cat = card.current.admins[1].key;
    act(() => card.current.updateAdmin(cat, { givenName: "Cat", surname: "Ng", mobile: "+61 400 000 003", employeeId: "E003" }));
    const pairOf = (upn: string, employeeId: string) => {
      const user = { id: `u-${upn}`, displayName: upn, userPrincipalName: upn, manager: "Max Ng", managerId: "me", employeeId };
      return { user, privileged: { ...user, id: `u-adm_${upn}`, userPrincipalName: `adm_${upn}`, managerId: user.id } };
    };
    const flush = () => act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    vi.useFakeTimers();
    await act(async () => {
      await card.current.run();
    });
    await flush();
    expect(card.current.waitingAdmins.map((admin) => [admin.key, admin.status])).toEqual([[bob, "preparing"], [cat, "preparing"]]);

    // The read 3s after the run lists Bob.
    mocks.listAdminPairs.mockResolvedValue([pairOf("Bob.Wu@corp.com", "E002")]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(card.current.existingAdmins?.map((pair) => pair.user.id)).toEqual(["u-Bob.Wu@corp.com"]);
    expect(card.current.waitingAdmins.map((admin) => [admin.key, admin.status])).toEqual([[cat, "preparing"]]);

    // Still not listed after the read at 30s: Cat is unlisted, and Recheck reads again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(27000);
    });
    expect(card.current.waitingAdmins.map((admin) => [admin.key, admin.status])).toEqual([[cat, "unlisted"]]);
    expect(card.current.checking).toBe(false);
    mocks.listAdminPairs.mockResolvedValue([pairOf("Bob.Wu@corp.com", "E002"), pairOf("Cat.Ng@corp.com", "E003")]);
    act(() => card.current.recheck());
    expect(card.current.checking).toBe(true);
    await flush();
    expect(card.current.waitingAdmins).toEqual([]);
    expect(card.current.existingAdmins?.map((pair) => pair.user.id)).toEqual(["u-Bob.Wu@corp.com", "u-Cat.Ng@corp.com"]);
    vi.useRealTimers();
  });

  it("makes a manager from the list before their report, whatever the order", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    const cat = card.current.admins[0].key;
    let bob = "";
    act(() => {
      bob = card.current.addAdmin();
    });
    act(() => {
      card.current.updateAdmin(cat, { givenName: "Cat", surname: "Ng", mobile: "+61 400 000 003", employeeId: "E003", manager: { kind: "row", key: bob } });
      card.current.updateAdmin(bob, { givenName: "Bob", surname: "Wu", mobile: "+61 400 000 002", employeeId: "E002" });
    });
    expect(card.current.rowErrors).toEqual({});
    await act(async () => {
      await card.current.run();
    });

    // Bob is below Cat in the list but manages her, so his accounts are made first.
    expect(mocks.createUser.mock.calls.map((call) => call[1].userPrincipalName)).toEqual(["Bob.Wu@corp.com", "adm_Bob.Wu@corp.com", "Cat.Ng@corp.com", "adm_Cat.Ng@corp.com"]);
    expect(mocks.setUserManager.mock.calls.find((call) => call[1] === "u-Cat.Ng@corp.com")?.[2]).toBe("u-Bob.Wu@corp.com");
    expect(card.current.steps.filter((step) => step.status === "error")).toEqual([]);
  });

  it("points a row left in the list at its manager's new account once that admin is done", async () => {
    mocks.createUser.mockImplementation(async (_, params: { userPrincipalName: string }) => {
      if (params.userPrincipalName === "Cat.Ng@corp.com") throw new Error("Insufficient privileges");
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

    // Bob is done and waits; Cat failed, stays, and now reports to Bob's account in Entra, so a rerun can make her.
    expect(card.current.waitingAdmins.map((createdAdmin) => createdAdmin.key)).toEqual([bob]);
    expect(card.current.admins.map((admin) => [admin.key, admin.manager])).toEqual([[cat, { kind: "entra", id: "u-Bob.Wu@corp.com", displayName: "Bob Wu", userPrincipalName: "Bob.Wu@corp.com" }]]);
    expect(card.current.rowErrors).toEqual({});
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
    // Not done, so both stay in the list to add.
    expect(card.current.admins.map((admin) => admin.key)).toEqual([bob, cat]);
  });

  it("asks whether an account Entra already has under the UPN is this person, and reuses it only once confirmed", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.primaryDomain).toBe("corp.com"));
    const key = card.current.admins[0].key;
    act(() => card.current.updateAdmin(key, { givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001" }));
    await waitFor(() => expect(card.current.rowErrors).toEqual({ [key]: "Ann.Lee@corp.com (Ann Lee) is already in Entra but doesn't have a Privileged Account yet. If you use it, adm_Ann.Lee@corp.com will be created as its Privileged Account." }));
    expect(card.current.rowWarnings).toEqual({});
    act(() => card.current.updateAdmin(key, { confirmedAccountIds: ["u-Ann.Lee@corp.com"] }));
    expect(card.current.rowErrors).toEqual({});
    expect(card.current.rowWarnings).toEqual({ [key]: "Reusing Ann.Lee@corp.com, confirmed as this person." });
    act(() => card.current.updateAdmin(key, { username: "ann2" }));
    expect(card.current.rowWarnings).toEqual({});
  });

  it("changes nothing on an account Entra already has that nobody confirmed, even when the run starts before the lookup", async () => {
    const card = renderCard();
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    const ann = card.current.admins[0].key;
    act(() => card.current.updateAdmin(ann, { givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001" }));
    // The lookup waits for typing to stop, so the row has no error yet.
    expect(card.current.rowErrors).toEqual({});
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.find((step) => step.id === `user:${ann}`)).toMatchObject({ status: "error", detail: "Ann.Lee@corp.com is already in Entra and wasn't confirmed as this person, so nothing was changed." });
    expect(card.current.steps.find((step) => step.id === `priv:${ann}`)).toMatchObject({ status: "error", detail: "Not created, because the user account failed" });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.setUserManager).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    // The lookup after the run asks the question.
    await waitFor(() => expect(card.current.rowErrors[ann]).toBe("Ann.Lee@corp.com (Ann Lee) is already in Entra but doesn't have a Privileged Account yet. If you use it, adm_Ann.Lee@corp.com will be created as its Privileged Account."));
  });

  it("offers the account Entra has with the employee ID under another UPN, and updates it instead of making another", async () => {
    const alee = { id: "u-alee@corp.com", displayName: "Ann Lee", userPrincipalName: "alee@corp.com", employeeId: "E001" };
    mocks.listUsersByEmployeeId.mockImplementation(async (_a, employeeId: string) => (employeeId === "E001" ? [alee] : []));
    mocks.getUserByUpn.mockImplementation(async (_a, upn: string) => (upn === "alee@corp.com" ? alee : null));
    const card = renderCard();
    await waitFor(() => expect(card.current.signedInUser).not.toBeNull());
    await waitFor(() => expect(card.current.entraLicence).toBe("p1"));
    const ann = card.current.admins[0].key;
    act(() => card.current.updateAdmin(ann, { givenName: "Ann", surname: "Lee", mobile: "+61 400 000 001", employeeId: "E001" }));
    await waitFor(() => expect(card.current.rowIssues[ann]?.map((issue) => [issue.field, issue.summary])).toEqual([["employeeId", "Employee ID already in Entra"]]));
    const fix = card.current.rowIssues[ann][0].fix;
    expect(fix?.label).toBe("Use alee@corp.com");

    // The row takes that UPN, and the account counts as confirmed.
    act(() => card.current.updateAdmin(ann, fix?.patch ?? {}));
    await waitFor(() => expect(card.current.rowWarnings[ann]).toBe("Reusing alee@corp.com, confirmed as this person."));
    expect(card.current.rowIssues).toEqual({});
    await act(async () => {
      await card.current.run();
    });

    expect(card.current.steps.filter((step) => step.id.endsWith(ann)).map((step) => step.label)).toEqual(["Update alee@corp.com", "Create adm_alee@corp.com"]);
    expect(mocks.createUser.mock.calls.map((call) => call[1].userPrincipalName)).toEqual(["adm_alee@corp.com"]);
    expect(card.current.steps.filter((step) => step.status === "error")).toEqual([]);
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
    key: "1", givenName: "", surname: "", mobile: "", employeeId: "", displayName: null, username: null, domain: null, manager: null, confirmedAccountIds: [], ...patch,
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
    key, givenName: "A", surname: "B", mobile: "+61 400 000 000", employeeId: `E${key}`, displayName: null, username, domain: null, manager: null, confirmedAccountIds: [], ...patch,
  });

  it("asks before reusing an account Entra already has, and never reuses one with another employee ID", () => {
    const ann = { id: "u-ann", displayName: "Ann Lee", userPrincipalName: "ann@corp.com", employeeId: null };
    const taken = new Map([["ann@corp.com", ann]]);
    expect(adminRowErrors([row("1", "ann")], [], "corp.com", taken)).toEqual({ 1: "ann@corp.com (Ann Lee) is already in Entra but doesn't have a Privileged Account yet. If you use it, adm_ann@corp.com will be created as its Privileged Account." });
    expect(adminRowIssues([row("1", "ann")], [], "corp.com", taken)["1"][0]).toMatchObject({ kind: "decision", summary: "UPN already in Entra", fix: { label: "Use ann@corp.com", patch: { confirmedAccountIds: ["u-ann"] } } });
    expect(adminRowErrors([row("1", "ann", { confirmedAccountIds: ["u-ann"] })], [], "corp.com", taken)).toEqual({});
    // A confirmation is for that account only.
    expect(adminRowErrors([row("1", "ann", { confirmedAccountIds: ["u-other"] })], [], "corp.com", taken)).toHaveProperty("1");
    const someoneElse = new Map([["ann@corp.com", { ...ann, employeeId: "E055" }]]);
    expect(adminRowErrors([row("1", "ann", { employeeId: "E200", confirmedAccountIds: ["u-ann"] })], [], "corp.com", someoneElse)).toEqual({
      1: "ann@corp.com is associated with Ann Lee, whose Employee ID is E055, not E200. Enter a different UPN.",
    });
    // Before the employee ID is in, it asks too, and Use fills in the one Entra has.
    const asked = adminRowIssues([row("1", "ann", { employeeId: "" })], [], "corp.com", someoneElse)["1"];
    expect(asked.map((issue) => [issue.field, issue.kind])).toEqual([["employeeId", "input"], ["upn", "decision"]]);
    expect(asked[1].fix?.patch).toEqual({ confirmedAccountIds: ["u-ann"], employeeId: "E055" });
  });

  it("says a row nothing was typed in isn't started, and counts the missing fields once it is", () => {
    const empty = newAdmin();
    expect(issueHeadline(empty, adminRowIssues([empty])[empty.key])).toBe("Not started");
    const started = { ...empty, givenName: "Ann" };
    expect(issueHeadline(started, adminRowIssues([started])[started.key])).toBe("3 fields missing");
  });

  it("lists every problem with its field, and offers the unlisted account that has the employee ID", () => {
    const alee = { id: "u-alee", displayName: "Ann Lee", userPrincipalName: "alee@corp.com", employeeId: "E1" };
    const privileged = { ...alee, id: "u-adm_alee", userPrincipalName: "adm_alee@corp.com" };
    const issues = adminRowIssues([row("1", "Ann.Lee", { mobile: "" })], [], "corp.com", new Map(), new Map([["e1", [alee, privileged]]]));
    expect(issues["1"].map((issue) => [issue.field, issue.kind, issue.summary])).toEqual([["mobile", "input", "Mobile number missing"], ["employeeId", "decision", "Employee ID already in Entra"]]);
    expect(issues["1"][1].message).toBe("Employee ID E1 is associated with alee@corp.com and adm_alee@corp.com (Ann Lee), which aren't set up as admins yet. If you use them, no new accounts will be created.");
    expect(issues["1"][1].fix).toEqual({ label: "Use alee@corp.com", patch: { username: "alee", domain: null, confirmedAccountIds: ["u-alee", "u-adm_alee"] } });
    // Under that UPN, the accounts are the row's own.
    expect(adminRowIssues([row("1", "alee")], [], "corp.com", new Map(), new Map([["e1", [alee, privileged]]]))).toEqual({});
    // Two people's accounts: no single fix.
    const other = { ...alee, id: "u-annl", userPrincipalName: "annl@corp.com" };
    expect(adminRowIssues([row("1", "Ann.Lee")], [], "corp.com", new Map(), new Map([["e1", [alee, other]]]))["1"][0].fix).toBeUndefined();
  });

  it("flags missing names, missing or bad mobiles, missing employee IDs, bad UPNs, and duplicates", () => {
    expect(adminRowErrors([row("1", "ann", { givenName: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { mobile: "abc" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { manager: { kind: "row", key: "gone" } })])).toEqual({ "1": "The selected manager was removed from this list. Select another manager." });
    expect(adminRowErrors([row("1", "ann", { employeeId: " " })])).toEqual({ "1": "Enter the employee ID." });
    expect(adminRowErrors([row("1", "ann", { employeeId: "e7" }), row("2", "bob", { employeeId: "E7 " })])).toEqual({ 2: "Employee ID E7 is already used by User 1. Enter a different Employee ID, or remove this entry if it refers to the same person." });
    expect(adminRowErrors([row("1", "ann", { mobile: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann", { displayName: "" })])).toHaveProperty("1");
    expect(adminRowErrors([row("1", ".ann")])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "ann@corp.com")])).toHaveProperty("1");
    expect(adminRowErrors([row("1", "Ann.Lee"), row("2", "ann.lee")], [], "corp.com")).toEqual({ 2: "ann.lee@corp.com is already used by User 1. Enter a different UPN." });
    expect(adminRowErrors([row("1", "bob"), row("2", "adm_bob")], [], "corp.com")).toEqual({ 2: "adm_bob@corp.com is already used by User 1. Enter a different UPN." });
    expect(duplicateUpns([row("1", "bob"), row("2", "ann"), row("3", "adm_bob")])).toEqual({ 3: { upn: "adm_bob", row: 1 } });
    expect(duplicateUpns([row("1", ""), row("2", "")])).toEqual({});
    expect(adminRowErrors([row("1", "ann.lee"), row("2", "bob_wu-2")])).toEqual({});
  });

  it("puts each manager from the list before their reports, and blocks admins who'd manage each other", () => {
    const cat = row("1", "cat", { givenName: "Cat", surname: "Ng", manager: { kind: "row", key: "3" } });
    const ann = row("2", "ann");
    const bob = row("3", "bob", { givenName: "Bob", surname: "Wu", manager: { kind: "row", key: "2" } });
    expect(byManager([cat, ann, bob]).map((admin) => admin.key)).toEqual(["2", "3", "1"]);
    expect(adminRowErrors([cat, ann, bob])).toEqual({});
    // Bob picks Cat, who already reports to him: each row names the other.
    const loop = [cat, ann, { ...bob, manager: { kind: "row" as const, key: "1" } }];
    expect(managerLoop(loop, loop[0])).toBe("Bob Wu already reports to this admin, so they can't manage each other.");
    expect(adminRowErrors(loop)).toEqual({
      1: "Pick another manager; Bob Wu already reports to this admin, so they can't manage each other.",
      3: "Pick another manager; Cat Ng already reports to this admin, so they can't manage each other.",
    });
  });

  it("blocks an employee ID an existing admin has, except a rerun for that admin", () => {
    const dan = { id: "u", displayName: "Dan Ho", userPrincipalName: "Dan.Ho@corp.com", manager: null, managerId: null, employeeId: "E9" };
    const existing = [{ user: dan, privileged: { ...dan, id: "p", userPrincipalName: "adm_Dan.Ho@corp.com" } }];
    expect(adminRowErrors([row("1", "ann", { employeeId: "e9 " })], existing, "corp.com")).toEqual({ 1: "Employee ID e9 is associated with Dan.Ho@corp.com, which already has a Privileged Account. Enter a different Employee ID, or remove this entry if it refers to the same person." });
    expect(adminRowErrors([row("1", "dan.ho", { employeeId: "E9" })], existing, "corp.com")).toEqual({});
  });
});
