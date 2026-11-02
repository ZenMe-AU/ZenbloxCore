/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AzureAccount } from "../types";

const graph = vi.hoisted(() => ({
  getExistingSP: vi.fn(),
  listAppRoleAssignments: vi.fn(),
  grantAdminConsent: vi.fn(),
}));
vi.mock("../api/azureGraph", () => graph);

const { useAzurePermissions } = await import("../hooks/util/useAzurePermissions");
type Perms = ReturnType<typeof useAzurePermissions>;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
beforeEach(() => {
  vi.clearAllMocks();
  graph.getExistingSP.mockResolvedValue({ id: "sp-1" });
  graph.listAppRoleAssignments.mockResolvedValue([]);
  graph.grantAdminConsent.mockResolvedValue(undefined);
});

// Two hooks side by side, the way two cards each hold their own.
async function mountPair(a: readonly string[], b: readonly string[]) {
  const latest: { a: Perms | null; b: Perms | null } = { a: null, b: null };
  root = createRoot(document.createElement("div"));
  // Outside the render, like the app's signed-in account: a fresh object each render would re-run the check forever.
  const common = { azureAccount: { username: "u" } as AzureAccount, spClientId: "client-1" };
  function Harness() {
    latest.a = useAzurePermissions({ ...common, permissions: a });
    latest.b = useAzurePermissions({ ...common, permissions: b });
    return null;
  }
  await act(async () => {
    root!.render(React.createElement(Harness));
  });
  return latest;
}

describe("each card grants on its own", () => {
  it("one card granting leaves the other alone", async () => {
    const perms = await mountPair(["perm-a"], ["perm-b"]);
    let release!: () => void;
    graph.getExistingSP.mockImplementation(() => new Promise((r) => (release = () => r({ id: "sp-1" }))));

    let pending!: Promise<void>;
    await act(async () => {
      pending = perms.a!.grant();
    });

    expect(perms.a!.granting).toBe(true);
    expect(perms.b!.granting).toBe(false); // separate state, not a shared flag

    await act(async () => {
      release();
      await pending;
    });
    expect(perms.a!.granting).toBe(false);
  });

  it("grants only what that card declares, never the union", async () => {
    const perms = await mountPair(["perm-a"], ["perm-b"]);
    await act(async () => {
      await perms.a!.grant();
    });
    expect(graph.grantAdminConsent).toHaveBeenCalledWith(expect.anything(), "sp-1", ["perm-a"], undefined);
    expect(graph.grantAdminConsent).not.toHaveBeenCalledWith(expect.anything(), "sp-1", expect.arrayContaining(["perm-b"]), undefined);
  });

  it("does nothing at all for a card that needs no permissions", async () => {
    const perms = await mountPair([], ["perm-b"]);
    graph.getExistingSP.mockClear(); // b checks its own on mount
    await act(async () => {
      await perms.a!.grant();
    });
    expect(graph.getExistingSP).not.toHaveBeenCalled();
    expect(perms.a!.granting).toBe(false);
    expect(perms.a!.ready).toBe(true);
  });

  it("keeps grant stable across renders when permissions come from the pipeline", async () => {
    // Both hoisted: the callback also depends on the account, so a fresh object each render
    // would churn it regardless of the permissions array.
    const stable: readonly string[] = ["perm-a"];
    const account = { username: "u" } as AzureAccount;
    const seen: (() => Promise<void>)[] = [];
    root = createRoot(document.createElement("div"));
    function Harness({ n }: { n: number }) {
      const p = useAzurePermissions({ azureAccount: account, spClientId: "client-1", permissions: stable });
      seen.push(p.grant);
      return React.createElement("span", null, n);
    }
    await act(async () => {
      root!.render(React.createElement(Harness, { n: 1 }));
    });
    await act(async () => {
      root!.render(React.createElement(Harness, { n: 2 }));
    });
    // A fresh array each render would rebuild the callback every time.
    expect(seen[seen.length - 1]).toBe(seen[0]);
  });
});

// The stage card shows its permission notice whenever `ready` is false.
async function mountOne(permissions: readonly string[], azureAccount: AzureAccount | null = { username: "u" } as AzureAccount) {
  let latest: Perms | null = null;
  root = createRoot(document.createElement("div"));
  function Harness() {
    latest = useAzurePermissions({ azureAccount, spClientId: "client-1", permissions });
    return null;
  }
  await act(async () => {
    root!.render(React.createElement(Harness));
  });
  return () => latest!;
}

describe("the permission notice", () => {
  const PERMS: readonly string[] = ["perm-a"];

  it("names what is missing, without granting anything", async () => {
    const perms = await mountOne(PERMS);
    expect(perms().ready).toBe(false);
    expect(perms().missing).toEqual(["perm-a"]);
    expect(graph.grantAdminConsent).not.toHaveBeenCalled();
  });

  it("stays away once every permission is already assigned", async () => {
    graph.listAppRoleAssignments.mockResolvedValue(["perm-a"]);
    const perms = await mountOne(PERMS);
    expect(perms().ready).toBe(true);
  });

  it("goes away after the user grants them", async () => {
    const perms = await mountOne(PERMS);
    await act(async () => {
      await perms().grant();
    });
    expect(graph.grantAdminConsent).toHaveBeenCalledWith(expect.anything(), "sp-1", ["perm-a"], undefined);
    expect(perms().ready).toBe(true);
  });

  it("stays up and says why when the grant fails", async () => {
    graph.grantAdminConsent.mockRejectedValue(new Error("boom"));
    const perms = await mountOne(PERMS);
    await act(async () => {
      await perms().grant();
    });
    expect(perms().ready).toBe(false);
    expect(perms().error).toBe("boom");
    expect(perms().missing).toEqual(["perm-a"]);
  });

  it("cannot confirm anything before Azure is signed in", async () => {
    const perms = await mountOne(PERMS, null);
    expect(perms().ready).toBe(false);
    expect(perms().error).toMatch(/Sign in to Azure/);
    expect(graph.getExistingSP).not.toHaveBeenCalled();
  });
});
