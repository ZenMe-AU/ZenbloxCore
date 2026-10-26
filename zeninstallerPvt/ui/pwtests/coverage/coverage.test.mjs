import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import MCR from "monocart-coverage-reports";
import options from "./coverage-options.mjs";
import setup from "./global-setup.mjs";
import teardown from "./global-teardown.mjs";

// Capture the fixture definition without starting Playwright's test runner.
mock.module("@playwright/test", {
  exports: { test: { extend: (fixtures) => fixtures }, expect: {} },
});
const { test: fixtures } = await import("./coverage-fixture.mts");
const [collect, fixtureOptions] = fixtures.coverage;
const originalOutputDir = options.outputDir;
const outputDir = await mkdtemp(path.join(tmpdir(), "playwright-coverage-test-"));
options.outputDir = outputDir;

beforeEach(setup);
after(async () => {
  options.outputDir = originalOutputDir;
  mock.restoreAll();
  await rm(outputDir, { recursive: true, force: true });
});

function entry(name) {
  const source = `globalThis.${name} = 1;`;
  return {
    url: `http://localhost:5174/core/corp-src/${name}.js`,
    source,
    functions: [{
      functionName: "",
      isBlockCoverage: true,
      ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
    }],
  };
}

function pageFor(entries, { closed = false, stopError } = {}) {
  const events = [];
  return {
    events,
    isClosed: () => closed,
    coverage: {
      async startJSCoverage(settings) {
        assert.deepEqual(settings, { resetOnNavigation: false });
        events.push("start");
      },
      async stopJSCoverage() {
        events.push("stop");
        if (stopError) throw stopError;
        return entries;
      },
    },
  };
}

async function readReport() {
  await teardown();
  return JSON.parse(await readFile(path.join(outputDir, "coverage-report.json"), "utf8"));
}

test("automatically collects before use and merges parallel contributors once", async () => {
  assert.equal(fixtureOptions.auto, true);
  assert.equal(options.cleanCache, false);
  const pages = [pageFor([entry("first")]), pageFor([entry("second")])];
  await Promise.all(pages.map((page) => collect({ page, browserName: "chromium" }, async () => {
    page.events.push("use");
  })));
  for (const page of pages) assert.deepEqual(page.events, ["start", "use", "stop"]);
  const report = await readReport();
  assert.equal(report.files.length, 2);
  assert.ok(report.files.some((file) => file.sourcePath.endsWith("/corp-src/first.js")));
  assert.ok(report.files.some((file) => file.sourcePath.endsWith("/corp-src/second.js")));
  assert.match(await readFile(path.join(outputDir, "index.html"), "utf8"), /<html/);
});

test("persists coverage on assertion failures without suppressing the failure", async () => {
  const failure = new Error("original assertion failure");
  const page = pageFor([entry("failed")]);
  await assert.rejects(collect({ page, browserName: "chromium" }, async () => {
    throw failure;
  }), (error) => error === failure);
  assert.equal((await readReport()).files.length, 1);
});

test("resolves Vite relative sourcemaps to exact workspace paths before filtering", async () => {
  const mapped = entry("mapped");
  mapped.url = "http://localhost:5174/core/corp-src/cards/AzureLogin/AzureLoginCard.tsx?t=123";
  mapped.sourceMap = {
    version: 3,
    sources: ["AzureLoginCard.tsx"],
    sourcesContent: [mapped.source],
    names: [],
    mappings: "AAAA",
  };
  await MCR(options).add([mapped]);
  const report = await readReport();
  assert.deepEqual(report.files.map((file) => file.sourcePath), [
    "zeninstallerPvt/ui/corp-src/cards/AzureLogin/AzureLoginCard.tsx",
  ]);
});

test("normalizes browser, file, and Vite filesystem URLs without changing map-relative paths", () => {
  const expected = "zeninstallerPvt/ui/corp-src/cards/AzureLogin/AzureLoginCard.tsx";
  const sourceUrl = new URL("../../corp-src/cards/AzureLogin/AzureLoginCard.tsx", import.meta.url);
  assert.equal(options.sourcePath("unused", { url: sourceUrl.href }), expected);
  assert.equal(options.sourcePath("unused", {
    url: `http://localhost:5174/core/@fs/${sourceUrl.pathname.slice(1)}`,
  }), expected);
  assert.equal(options.sourcePath("unused", {
    url: "../AzureLogin/AzureLoginCard.tsx",
    distFile: "zeninstallerPvt/ui/corp-src/cards/Other/Other.tsx",
  }), expected);
});

test("non-Chromium tests run without invoking native coverage", async () => {
  let used = false;
  const page = pageFor([]);
  await collect({ page, browserName: "firefox" }, async () => { used = true; });
  assert.equal(used, true);
  assert.deepEqual(page.events, []);
  assert.equal(MCR(options).hasCache(), false);
});

test("closed pages and collection failures remain errors", async () => {
  await assert.rejects(collect({
    page: pageFor([], { closed: true }), browserName: "chromium",
  }, async () => {}), /covered page was closed/);
  const failure = new Error("CDP collection failed");
  await assert.rejects(collect({
    page: pageFor([], { stopError: failure }), browserName: "chromium",
  }, async () => {}), (error) => error === failure);
});

test("filters dependencies and Vite runtime out of the application report", async () => {
  const dependency = { ...entry("vendor"), url: "http://localhost:5174/core/node_modules/vendor.js" };
  const runtime = { ...entry("runtime"), url: "http://localhost:5174/core/@vite/client" };
  await collect({
    page: pageFor([entry("application"), dependency, runtime]), browserName: "chromium",
  }, async () => {});
  const report = await readReport();
  assert.equal(report.files.length, 1);
  assert.ok(report.files[0].sourcePath.endsWith("/corp-src/application.js"));
});

test("coordinator rejects missing coverage and results outside application scope", async () => {
  await assert.rejects(teardown(), /No browser coverage collected/);
  await MCR(options).add([{ ...entry("runtime"), url: "http://localhost:5174/core/@vite/client" }]);
  await assert.rejects(teardown(), /No application coverage generated/);
});

test("setup clears stale reports as well as cached inputs", async () => {
  await MCR(options).add([entry("stale")]);
  await writeFile(path.join(outputDir, "index.html"), "stale report");
  await setup();
  assert.equal(MCR(options).hasCache(), false);
  await assert.rejects(readFile(path.join(outputDir, "index.html")), { code: "ENOENT" });
});
