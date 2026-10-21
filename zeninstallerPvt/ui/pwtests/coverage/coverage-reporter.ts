import type { FullConfig, Reporter, Suite } from "@playwright/test/reporter";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { organizeTestResult } from "./results-layout.js";

export default class CoverageReporter implements Reporter {
  private suite?: Suite;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite;
  }

  async onEnd(): Promise<void> {
    if (!this.suite) throw new Error("Cannot organize test results: the test suite was not initialized.");
    const outputDirectories = new Set<string>();
    for (const test of this.suite.allTests()) {
      const project = test.parent.project();
      if (!project) throw new Error(`Cannot identify the project for test: ${test.title}`);
      outputDirectories.add(project.outputDir);
      for (const testResult of test.results) {
        await organizeTestResult(test, testResult, project.outputDir);
      }
    }
    const converter = fileURLToPath(new URL("./playwright-coverage.mjs", import.meta.url));
    const uiDirectory = fileURLToPath(new URL("../../", import.meta.url));
    for (const outputDirectory of outputDirectories) {
      execFileSync(process.execPath, [converter, outputDirectory], { cwd: uiDirectory, stdio: "inherit"});
    }
  }
}