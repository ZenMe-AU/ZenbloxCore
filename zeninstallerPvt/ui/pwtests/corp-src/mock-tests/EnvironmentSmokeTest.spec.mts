/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { CORP_URL } from "../../testInit.ts";

test.describe.configure({ retries: 0, timeout: 15_000 });

test("Environment is configured and the installer loads", async ({ page }) => {
  const env = loadEnv("development", fileURLToPath(new URL("../../../", import.meta.url)), "");
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  expect(guid.test(env.VITE_AZURE_CLIENT_ID ?? ""), "Set VITE_AZURE_CLIENT_ID to the installer app's client ID").toBe(true);
  expect(!env.VITE_AZURE_TENANT_ID || guid.test(env.VITE_AZURE_TENANT_ID), "VITE_AZURE_TENANT_ID must be empty or a tenant GUID").toBe(true);
  for (const key of ["BASE_URL", "VITE_API_URL", "VITE_TERMINAL_API_URL"]) {
    expect(!env[key] || (/^https?:\/\//.test(env[key]) && URL.canParse(env[key])), `${key} must be empty or an HTTP(S) URL`).toBe(true);
  }
  expect(
    (!env.VITE_API_URL && !env.VITE_GITHUB_CLIENT_ID) || /^[A-Za-z0-9_]+$/.test(env.VITE_GITHUB_CLIENT_ID ?? ""),
    "VITE_GITHUB_CLIENT_ID must be an OAuth client ID and is required when VITE_API_URL is set",
  ).toBe(true);
  expect(
    !env.GITHUB_TOKEN || /^(ghp_|github_pat_)[A-Za-z0-9_]+$/.test(env.GITHUB_TOKEN),
    "GITHUB_TOKEN must be empty or a GitHub PAT",
  ).toBe(true);
  if (env.VITE_APPINSIGHTS_CONNECTION_STRING) {
    const settings = new Map(env.VITE_APPINSIGHTS_CONNECTION_STRING.split(";").filter(Boolean).map((setting) => {
      const separator = setting.indexOf("=");
      return [setting.slice(0, separator).toLowerCase(), setting.slice(separator + 1)];
    }));
    expect(guid.test(settings.get("instrumentationkey") ?? ""), "Application Insights needs a valid InstrumentationKey").toBe(true);
    for (const [key, value] of settings) {
      if (key.endsWith("endpoint")) {
        expect(/^https?:\/\//.test(value) && URL.canParse(value), `Application Insights ${key} must be an HTTP(S) URL`).toBe(true);
      }
    }
  }

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(CORP_URL);
  expect(response?.ok(), "The installer must respond successfully").toBe(true);
  await expect(page.getByText("Zenblox Core Environment Installer", { exact: true })).toBeVisible();
  const azureCard = page.locator("#card-azure_login");
  await azureCard.getByText("Azure login", { exact: true }).click();
  await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
  expect(errors, "The installer must load without uncaught JavaScript errors").toEqual([]);
});
