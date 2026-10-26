import type { FullConfig, Reporter, Suite } from "@playwright/test/reporter";
import { organizeTestResult } from "./results-layout.js";

export default class CoverageReporter implements Reporter {
  private suite?: Suite;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite;
  }

  async onEnd(): Promise<void> {
    if (!this.suite) throw new Error("Cannot organize test results: the test suite was not initialized.");
    for (const test of this.suite.allTests()) {
      const project = test.parent.project();
      if (!project) throw new Error(`Cannot identify the project for test: ${test.title}`);
      for (const testResult of test.results) {
        await organizeTestResult(test, testResult, project.outputDir);
      }
    }
  }
}