/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = process.env.NODE_ENV || "dev";
// Enable Playwright API logs for normal and coverage runs, preserving other namespaces.
process.env.DEBUG = [process.env.DEBUG, "pw:api"].filter(Boolean).join(",");
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [
    path.resolve(currentDirectory, ".env"),
    path.resolve(currentDirectory, "zeninstallerPvt/ui/pwtests/.env"),
  ],
});

export default defineConfig({
  testDir: currentDirectory,
  outputDir: path.resolve(currentDirectory, "pwtest-results"),
  updateSnapshots: process.env.CI ? "none" : "missing",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  globalSetup: "./zeninstallerPvt/ui/pwtests/coverage/global-setup.mjs",
  globalTeardown: "./zeninstallerPvt/ui/pwtests/coverage/global-teardown.mjs",
  reporter: [
    // A terminal reporter is what streams worker stdout/stderr (incl. pw:api) to the console.
    ["line"], 
    [path.resolve(currentDirectory, "zeninstallerPvt/ui/pwtests/coverage/coverage-reporter.ts")],
  ],
  
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
    baseURL: "http://localhost:5174/core",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    testIdAttribute: "data-id",
  },

  projects: [
    {
      name: "Playwright Project",
      testMatch: "**/pwtests/**/*.{spec,setup}.{ts,mts}",
      fullyParallel: true,
      workers: 2,
      retries: 1,
      use: {
        ...devices["Desktop Chrome"]
      },
    },
  ],

  /**
   * Start the server automatically
   */
  webServer: {
    command: "pnpm run dev",
    url: process.env.BASE_URL || "http://localhost:5174/core/",
    cwd: path.resolve(currentDirectory, "zeninstallerPvt/ui"),
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
