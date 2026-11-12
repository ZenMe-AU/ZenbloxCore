/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import MCR from "monocart-coverage-reports";

const webDir = resolve(".");

// recursively searches all folders for v8-coverage.json
async function* findCoverageFiles(dir) {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const item of items) {
    const file = join(dir, item.name);
    if (item.isDirectory()) {
      yield* findCoverageFiles(file);
    } else if (item.name === "v8-coverage.json") {
      yield file;
    }
  }
}

function sourcePathFromUrl(url, sourceRoot) {
  if (url.pathname.startsWith("/@fs/")) {
    return resolve(decodeURIComponent(url.pathname.slice(5)));
  }
  const sourcePath = resolve(sourceRoot, `.${decodeURIComponent(url.pathname)}`);
  const sourceRelativePath = relative(sourceRoot, sourcePath);
  if (sourceRelativePath.startsWith("..") || isAbsolute(sourceRelativePath)) {
    return undefined;
  }
  return sourcePath;
}

// process every coverage record and removes irrelevant ones
function getApplicationCoverage(entries, sourceRoot) {
  const coverage = [];
  for (const entry of entries) {
    if (!entry.source || !entry.url) continue;
    let url;
    try {
      url = new URL(entry.url);
    } catch {
      continue;
    }
    // if (url.origin !== "http://localhost:5173") continue;
    if (!/\.[cm]?[jt]sx?$/.test(url.pathname) && !url.pathname.startsWith("/@fs/")) continue;
    const sourcePath = sourcePathFromUrl(url, sourceRoot);
    if (!sourcePath) continue;
    if (sourcePath.split(/[\\/]/).some((segment) => segment.toLowerCase() === "node_modules")) continue;
    coverage.push({
      ...entry,
      url: pathToFileURL(sourcePath).href,
    });
  }
  return coverage;
}

export async function generateCoverageReports(resultsDirectory, sourceRoot = webDir) {
  const resultsDir = resolve(resultsDirectory);
  const aggregateCoverage = [];
  for await (const file of findCoverageFiles(resultsDir)) {
    const entries = JSON.parse(await readFile(file, "utf8"));
    aggregateCoverage.push(...getApplicationCoverage(entries, sourceRoot));
  }
  if (aggregateCoverage.length === 0) {
    console.log("No application coverage was collected in this run.");
    return;
  }
  const aggregateReportDirectory = resolve(resultsDir, "coverage-report");
  const workspaceRoot = resolve(sourceRoot, "../..");
  const report = MCR({
    name: "Playwright Coverage",
    baseDir: workspaceRoot,
    outputDir: aggregateReportDirectory,
    reports: ["v8-json"],
    sourcePath: (sourcePath, { url, distFile }) => {
      if (!distFile || URL.canParse(url) || isAbsolute(url)) return sourcePath;
      // Vite source-map filenames are relative to the captured script, not cwd.
      return relative(workspaceRoot, resolve(workspaceRoot, dirname(distFile), url)).replace(/\\/g, "/");
    },
  });
  await report.add(aggregateCoverage);
  await report.generate();
  console.log(`Coverage report: ${join(aggregateReportDirectory, "coverage-report.json")}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultsDirectory = process.argv[2] ?? resolve(webDir, "../../pwtest-results");
  await generateCoverageReports(resultsDirectory);
}
