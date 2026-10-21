/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { convert } from "ast-v8-to-istanbul";
import { parseAstAsync } from "vite";
import coverageLib from "istanbul-lib-coverage";
import reportLib from "istanbul-lib-report";
import reports from "istanbul-reports";

const { createCoverageMap } = coverageLib;
const { createContext } = reportLib;

const webDir = resolve(".");

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

async function addV8Coverage(entries, coverageMap, sourceRoot) {
  let converted = 0;
  for (const entry of entries) {
    if (!entry.source || !entry.url) continue;
    let url;
    try {
      url = new URL(entry.url);
    } catch {
      continue;
    }
    if (url.origin !== "http://localhost:5173") continue;
    if (!/\.[cm]?[jt]sx?$/.test(url.pathname) && !url.pathname.startsWith("/@fs/")) continue;
    const sourcePath = sourcePathFromUrl(url, sourceRoot);
    if (!sourcePath) continue;
    if (sourcePath.split(/[\\/]/).some((segment) => segment.toLowerCase() === "node_modules")) continue;
    const istanbulData = await convert({
      ast: await parseAstAsync(entry.source),
      code: entry.source,
      wrapperLength: 0,
      coverage: {
        scriptId: entry.scriptId,
        url: pathToFileURL(sourcePath).href,
        functions: entry.functions,
      },
    });
    coverageMap.merge(istanbulData);
    converted++;
  }
  return converted;
}

function writeLcovReport(coverageMap, reportDirectory) {
  const context = createContext({
    dir: reportDirectory,
    coverageMap,
  });
  reports.create("lcovonly").execute(context);
}

export async function generateCoverageReports(resultsDirectory, sourceRoot = webDir) {
  const resultsDir = resolve(resultsDirectory);
  const aggregateMap = createCoverageMap({});
  let aggregateConverted = 0;
  for await (const file of findCoverageFiles(resultsDir)) {
    const entries = JSON.parse(await readFile(file, "utf8"));
    const testCoverageMap = createCoverageMap({});
    const testConverted = await addV8Coverage(entries, testCoverageMap, sourceRoot);
    if (testConverted > 0) {
      writeLcovReport(testCoverageMap, resolve(dirname(file), "coverage-report"));
      aggregateMap.merge(testCoverageMap);
      aggregateConverted += testConverted;
    }
  }
  if (aggregateConverted === 0) {
    console.log("No application coverage was collected in this run.");
    return;
  }
  const aggregateReportDirectory = resolve(resultsDir, "coverage-report");
  writeLcovReport(aggregateMap, aggregateReportDirectory);
  reports.create("text-summary").execute(createContext({
    dir: aggregateReportDirectory,
    coverageMap: aggregateMap,
  }));
  console.log(`Coverage report: ${join(aggregateReportDirectory, "lcov.info")}`);
  console.log("Per-test coverage reports are saved in each test-result directory.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultsDirectory = process.argv[2] ?? resolve(webDir, "../../pwtest-results");
  await generateCoverageReports(resultsDirectory);
}
