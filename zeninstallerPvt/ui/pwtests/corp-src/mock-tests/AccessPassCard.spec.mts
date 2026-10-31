/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AccessPass/AccessPassCard.tsx
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { test, getViewportName } from "../../../../../.playwright/viewportFixture.mjs";
import { expectSnapshot } from "../../../../../.playwright/testHelper.js";
import { MICROSOFT_GRAPH_URL } from "../../testInit";
import { prepareCardMocks, replyJson } from "../util/mockCardSetup.mts";

test("Happy path", async ({ page, context }, testInfo) => {
  await runHappyPath(page, context, testInfo);
});

test("Explains missing TAP permissions without showing a pass", async ({ page, context }, testInfo) => {
  const { card, state, unexpectedRequests } = await prepareAccessPass(page, context, { denyPass: true });
  await card.getByRole("button", { name: "Create Access Pass", exact: true }).click();
  await card.getByRole("checkbox", { name: /verified the selected user's identity/ }).check();
  await card.getByRole("button", { name: "Create Access Pass", exact: true }).click();
  await expect(card.getByText(/Not authorized to create Temporary Access Pass\./)).toBeVisible();
  await expect(card.getByText("New Temporary Access Pass:", { exact: true })).toHaveCount(0);
  expect(state.passRequests).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("zeninstaller_corp_access_pass_result"))).toBeNull();
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "pass-denied", getViewportName(testInfo));
});

test("Shows an empty managed-user list without offering creation", async ({ page, context }, testInfo) => {
  const { card, state, unexpectedRequests } = await prepareAccessPass(page, context, { empty: true });
  await expect(card.getByText(/No users/).first()).toBeVisible();
  await expect(card.getByRole("button", { name: "Create Access Pass", exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
  await expectSnapshot(page, card, testInfo, "no-managed-users", getViewportName(testInfo));
});

async function runHappyPath(page: Page, context: BrowserContext, testInfo: TestInfo) {
  const { card, state, unexpectedRequests } = await prepareAccessPass(page, context);
  const viewport = getViewportName(testInfo);
  await test.step("Require photo-ID confirmation before changing sign-in methods", async () => {
    await expect(card.getByRole("row", { name: /Mock Managed User/ })).toBeVisible();
    await expect(card.getByRole("button", { name: "Create Access Pass", exact: true })).toBeEnabled();
    await expectSnapshot(page, card, testInfo, "start", viewport);
    await card.getByRole("button", { name: "Create Access Pass", exact: true }).click();
    await expect(card.getByRole("button", { name: "Create Access Pass", exact: true })).toBeDisabled();
    expect(state.writes).toEqual([]);
    await card.getByRole("checkbox", { name: /verified the selected user's identity/ }).check();
    await expectSnapshot(page, card, testInfo, "identity-confirmed", viewport);
  });
  await test.step("Replace the managed user's sign-in methods with a one-hour pass", async () => {
    await card.getByRole("button", { name: "Create Access Pass", exact: true }).click();
    await expect(card.getByText("New Temporary Access Pass:", { exact: true })).toBeVisible();
    await expect(card.getByText("Temporary Access Pass created", { exact: true })).toBeVisible();
    expect(state.writes).toEqual([
      "PATCH /v1.0/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/TemporaryAccessPass",
      "DELETE /v1.0/users/managed-user/authentication/phoneMethods/mock-phone",
      "PATCH /v1.0/users/managed-user",
      "POST /v1.0/users/managed-user/authentication/temporaryAccessPassMethods",
    ]);
    expect(state.passwordLength).toBe(30);
    expect(state.passRequests).toBe(1);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("zeninstaller_corp_access_pass_result") ?? "null")?.tapMethodId))
      .toBe("mock-tap");
    expect(unexpectedRequests).toEqual([]);
    await expectSnapshot(page, card, testInfo, "end", viewport);
  });
}

async function prepareAccessPass(page: Page, context: BrowserContext, options: { denyPass?: boolean; empty?: boolean } = {}) {
  const setup = await prepareCardMocks(page, context);
  const state = { writes: [] as string[], passRequests: 0, passwordLength: 0, policyEnabled: false };
  await page.route(`${MICROSOFT_GRAPH_URL}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/v1.0/me/directReports/microsoft.graph.user") {
      expect(method).toBe("GET");
      return replyJson(route, {
        value: options.empty
          ? []
          : [
              {
                id: "managed-user",
                displayName: "Mock Managed User",
                userPrincipalName: "managed@example.com",
              },
            ],
      });
    }
    const policyPath = "/v1.0/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/TemporaryAccessPass";
    if (path !== policyPath && !path.startsWith("/v1.0/users/managed-user")) return route.fallback();
    if (method !== "GET") state.writes.push(`${method} ${path}`);
    if (path === policyPath && method === "GET") return replyJson(route, { state: state.policyEnabled ? "enabled" : "disabled" });
    if (path === policyPath && method === "PATCH") {
      expect(request.postDataJSON()).toEqual({
        "@odata.type": "#microsoft.graph.temporaryAccessPassAuthenticationMethodConfiguration",
        state: "enabled",
      });
      state.policyEnabled = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/authentication/methods") && method === "GET")
      return replyJson(route, {
        value: [
          { id: "mock-password", "@odata.type": "#microsoft.graph.passwordAuthenticationMethod" },
          { id: "mock-phone", "@odata.type": "#microsoft.graph.phoneAuthenticationMethod" },
        ],
      });
    if (path.endsWith("/phoneMethods/mock-phone") && method === "DELETE") return route.fulfill({ status: 204 });
    if (path === "/v1.0/users/managed-user" && method === "PATCH") {
      const { passwordProfile } = request.postDataJSON();
      state.passwordLength = passwordProfile.password.length;
      expect(passwordProfile.forceChangePasswordNextSignIn).toBe(false);
      expect(passwordProfile.forceChangePasswordNextSignInWithMfa).toBe(false);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/temporaryAccessPassMethods") && method === "POST") {
      state.passRequests++;
      expect(request.postDataJSON()).toEqual({ isUsableOnce: true, lifetimeInMinutes: 60 });
      return replyJson(
        route,
        options.denyPass
          ? { error: { message: "AccessDenied" } }
          : {
              id: "mock-tap",
              temporaryAccessPass: "MOCK-PASS-ONLY",
              lifetimeInMinutes: 60,
              isUsableOnce: true,
            },
        options.denyPass ? 403 : 201
      );
    }
    if (path.endsWith("/temporaryAccessPassMethods/mock-tap") && method === "GET") return replyJson(route, { id: "mock-tap" });
    throw new Error(`Unexpected Access Pass request: ${method} ${path}`);
  });
  const card = await setup.open("access_pass");
  await expect(card.getByText("Loading users...", { exact: true })).toBeHidden();
  return { ...setup, card, state };
}
