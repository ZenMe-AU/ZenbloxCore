// Verifies the Azure help link opens the expected documentation in a new tab.

import {expect,test,} from "@playwright/test";
import {ACCESS_PASS_URL,viewports,} from "../../testInit";
import {expectPageSnapshot,} from "../testHelper";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - Azure Help Link`, () => {
    test.use({
      viewport,
      deviceScaleFactor: 1,
    });

    test.beforeEach(async ({ page }, testInfo) => {
      await page.goto(ACCESS_PASS_URL);
      await expectPageSnapshot(page,testInfo,"before-redirect.png",{userId: "unauth", viewportName});
    });

    test("Help Link Redirects", async ({page,context,}, testInfo) => {
      const docsLink = page.getByRole("link", {name: /How to Create a Free Azure Account/i,});
      await expect(docsLink).toBeVisible();
      await expect(docsLink).toHaveAttribute( "target","_blank",);
      const [newPage] = await Promise.all([context.waitForEvent("page"),docsLink.click(),]);

      try {
        await newPage.waitForLoadState("domcontentloaded",);
        await expect(newPage).toHaveURL(/./);
        await expectPageSnapshot(page,testInfo,"after-redirect.png",{userId: "unauth", viewportName});
      } finally {
        await newPage.close();
      }
    });
  });
}