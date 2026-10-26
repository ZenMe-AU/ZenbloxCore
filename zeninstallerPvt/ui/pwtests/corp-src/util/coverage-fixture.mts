import { test as base, expect } from "@playwright/test";
import { addCoverageReport } from 'monocart-reporter';


export const test = base.extend({
  page: async ({ page }, use) => {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      try {
        await use(page);
      } finally {
        if (page.isClosed()) {
          throw new Error("Coverage could not be collected: the covered page was closed.");
        }
        const jsCoverage = await page.coverage.stopJSCoverage();
        await addCoverageReport(jsCoverage, test.info());
      }
    },
});
export { expect };