/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// This script packages the authGuard Lambda for deployment.
import { execSync } from "child_process";
import { copyFileSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const distDir = resolve(root, "dist");

// Clean up dist directory if it exists, then create a new one
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// Copy source files to dist directory
copyFileSync(resolve(root, "index.mjs"), resolve(distDir, "index.mjs"));
copyFileSync(resolve(root, "package.json"), resolve(distDir, "package.json"));

// Install production dependencies in the dist directory
execSync("npm install --omit=dev --no-audit --no-fund", {
  cwd: distDir,
  stdio: "inherit",
  shell: true,
});

// Clean up unnecessary files that npm might have created
rmSync(resolve(distDir, "package.json"), { force: true });
rmSync(resolve(distDir, "package-lock.json"), { force: true });

console.log("Prepared Lambda package in dist/");
