import type { FullConfig, Reporter, Suite } from "@playwright/test/reporter";
import generateCoverage from "./global-teardown.mjs";
import { organizeTestResult } from "./results-layout.js";

export default class CoverageReporter implements Reporter {
  private suite?: Suite;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite;
  }

  async onEnd(): Promise<void | { status: "failed" }> {
    if (!this.suite) throw new Error("Cannot organize test results: the test suite was not initialized.");
    const tests = this.suite.allTests();
    if (!tests.some((test) => test.results.length > 0)) return;
    let coverageFailed = false;
    try {
      await generateCoverage();
    } catch (error) {
      console.error("Playwright coverage report generation failed:", error);
      coverageFailed = true;
    }
    for (const test of tests) {
      const project = test.parent.project();
      if (!project) throw new Error(`Cannot identify the project for test: ${test.title}`);
      for (const testResult of test.results) {
        await organizeTestResult(test, testResult, project.outputDir);
      }
    }
    if (coverageFailed) return { status: "failed" };
  }
}