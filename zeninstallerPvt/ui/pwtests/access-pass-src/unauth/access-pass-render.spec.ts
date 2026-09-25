import {expect,test,} from "@playwright/test";
import {ACCESS_PASS_URL,viewports,} from "../../testInit";
import {expectPageSnapshot,} from "../testHelper";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - Render Access Pass`, () => {
    test.use({viewport,deviceScaleFactor: 1,});

    test.beforeEach(async ({ page }, testInfo) => {
      await page.goto(ACCESS_PASS_URL);
    });

    test("Renders Access Pass Page", async ({ page }, testInfo) => {
      await expect(page).toHaveTitle(/ZenInstaller Access Pass/,);
      await expect(page.getByText("Access Pass").first(),).toBeVisible();
      await expect(page.getByText(/The ZenInstaller is used to deploy Zenblox to your environment/i,),).toBeVisible();
      await expect(page.getByText(/Azure Login/i).first(),).toBeVisible();
      await expect(page.getByRole("button", {name: /Connect Azure/i,}),).toBeVisible();
      await expect(page.getByText(/Azure Access Pass/i).first(),).toBeVisible();
      await expect(page.getByText(/Complete the Azure Login card first\. Access pass creation will unlock after Azure sign-in and tenant confirmation\./i,),).toBeVisible();

      await expectPageSnapshot(page,testInfo,"rendered.png", {userId: "unauth", viewportName, stabilizeAuth: true}
      );
    });
  });
}