/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const signedOutTests = [/access-pass-render\.spec\.ts/, /azure-help-link\.spec\.ts/, /zeninstaller-link\.spec\.ts/];
const authenticatedTests = [
  /authenticated-page-load\.spec\.ts/,
  /azure-connection\.spec\.ts/,
  /entra-user-action\.spec\.ts/,
  /tenant-outcome\.spec\.ts/,
  /access-pass-creation\.spec\.ts/,
];

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./src/pwtests",
  outputDir: "./src/pwtests/test-results",
  updateSnapshots: process.env.CI ? "none" : "missing",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
      pathTemplate: "{testDir}/{arg}{ext}",
    },
  },
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    testIdAttribute: "data-id",
  },
  projects: [
    {
      name: "azure-passkey-setup",
      testMatch: /azure-passkey\.setup\.ts/,
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "access-pass",
      testMatch: signedOutTests,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "access-pass-auth",
      testMatch: authenticatedTests,
      fullyParallel: false,
      workers: 1,
      retries: 1,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["azure-passkey-setup"],
    },
  ],
  webServer: {
    command: "pnpm --dir ../ui run dev",
    url: "http://localhost:5173",
    cwd: currentDirectory,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
