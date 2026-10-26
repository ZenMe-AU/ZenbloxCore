import { test as base, expect } from "@playwright/test";
import MCR from "monocart-coverage-reports";
import options from "./coverage-options.mjs";

export const test = base.extend<{ coverage: void }>({
  coverage: [
    async ({ page, browserName }, use) => {
      if (browserName !== "chromium") {
        await use();
        return;
      }
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      try {
        await use();
      } finally {
        if (page.isClosed()) {
          throw new Error("Coverage could not be collected: the covered page was closed.");
        }
        const entries = await page.coverage.stopJSCoverage();
        await MCR(options).add(entries);
      }
    },
    { auto: true },
  ],
});
export { expect };