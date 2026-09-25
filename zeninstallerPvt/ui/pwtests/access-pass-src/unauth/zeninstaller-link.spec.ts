// Verifies the ZenInstaller navigation link routes from Access Pass back to the app root.

import { expect, test, } from "@playwright/test";
import {ACCESS_PASS_URL, viewports, } from "../../testInit";
import { expectPageSnapshot, } from "../testHelper";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - ZenInstaller Link`, () => {
    test.use({viewport,deviceScaleFactor: 1,});

    test.beforeEach(async ({ page }, testInfo) => {
      await page.goto(ACCESS_PASS_URL);
      await expectPageSnapshot(page,testInfo,"before-redirect.png",{userId: "unauth", viewportName});
    });

    test("ZenInstaller Link Redirects", async ({ page }, testInfo) => {
      const navLink = page.getByRole("link", {name: "ZenInstaller",});
      await expect(navLink).toBeVisible();
      await Promise.all([page.waitForURL("http://localhost:5173/"), navLink.click(),]);
      await expect(page).toHaveURL(/http:\/\/localhost:5173\/$/,);
      await expectPageSnapshot(page,testInfo,"after-redirect.png",{userId: "unauth", viewportName});
    });
  });
}