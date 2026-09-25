// Verifies temporary Access Pass creation for configured and permitted user pairs.

import {expect,test,} from "@playwright/test";
import {viewports,} from "../../testInit";
import {
  changeTenantIdIfAvailable,
  expectAuthenticatedAccessPassState,
  expectEntraUserAvailable,
  expectEntraUserListLoaded,
  expectPageSnapshot,
  getAccessPassUserAuth,
  loadAccessPassUsers,
  openAuthenticatedAccessPassPage,
  sensitiveTextMasks,
} from "../testHelper";

const users = loadAccessPassUsers({softFail: true,});
test.skip(() => users.length === 0,"No local Access Pass users file was found. Authenticated tests are skipped.",);

const desktopViewport = viewports.Desktop;

console.log("RUN_ACCESS_PASS_CREATION:",process.env.RUN_ACCESS_PASS_CREATION,);

test.describe("AP-Desktop - Temporary Access Pass Creation", () => {
  test.use({viewport: desktopViewport,deviceScaleFactor: 1,});
  test.skip(({ browserName }) => browserName !== "chromium","Saved Microsoft passkey sessions are only tested in Chromium.",);

  for (const user of users) {
    if (user.expectedEntraResult !== "users") {
      continue;
    }

    const targets = user.targetEntraUsers ?? [];

    test.describe(user.id, () => {
      test.beforeEach(() => {
        const auth = getAccessPassUserAuth(user);

        test.skip(!auth.exists,
          [`Missing auth files for ${user.id}.`,
            `Expected storage: ${auth.storageStateFile}`,
            `Expected session: ${auth.sessionStorageFile}`,
          ].join(" "),
        );
      });

      for (const target of targets) {
        test(`Creating Temporary Access Pass for ${target.id}`,async ({ browser }, testInfo) => {
            test.skip(process.env.RUN_ACCESS_PASS_CREATION !== "true","Set RUN_ACCESS_PASS_CREATION=true to run real Access Pass creation.",);
            test.skip(!user.canCreateAccessPass,`${user.id} is not allowed to create access passes.`,);
            test.skip(!target.allowRealAccessPassCreation,`Real Access Pass creation is disabled for ${target.id}.`,);
            test.skip(!user.tenantId,`No tenantId configured for ${user.id}.`,);

            const {page,context,} = await openAuthenticatedAccessPassPage(browser,user,desktopViewport,);

            try {await expectAuthenticatedAccessPassState(page,user,);

              await changeTenantIdIfAvailable(page,user.tenantId!,);
              await expectEntraUserListLoaded(page);
              const {createAccessPassButton,} = await expectEntraUserAvailable(page,target,);
              const userTable =page.getByRole("table");
              const targetRow =userTable.getByRole("row").filter({hasText:target.email,});
              await expect(targetRow,).toHaveCount(1,);

              // First click: open confirmation.
              await createAccessPassButton.click();
              const confirmationRow =targetRow.locator("xpath=following-sibling::tr[1]",);
              await expect(confirmationRow,).toBeVisible({timeout: 30_000,});
              await expect(confirmationRow,).toContainText(/all existing access for this user will be deleted/i,);
              const photoIdCheckbox = confirmationRow.locator('input[type="checkbox"]',);
              await expect(photoIdCheckbox,).toBeVisible();
              await expect(photoIdCheckbox,).not.toBeChecked();
              const confirmCreateAccessPassButton =confirmationRow.getByRole("button",{name: "Create Access Pass", exact:true,},);
              await expect(confirmCreateAccessPassButton,).toBeDisabled();
              await photoIdCheckbox.check();
              await expect(photoIdCheckbox,).toBeChecked();
              await expect(confirmCreateAccessPassButton,).toBeEnabled();

            // Second click: start real Access Pass creation.
              await confirmCreateAccessPassButton.click();
              const createAgainButton = targetRow.getByRole("button",{name:"Create Again",exact:true,},);
              await expect(createAgainButton,`Expected Temporary Access Pass creation to complete for ${target.email}.`,).toBeVisible({timeout: 120_000,});
              await expect(page.getByText("Access pass created",{exact: true,},).first(),).toBeVisible();
              const accessPassLabel = page.getByText("New Temporary Access Pass:",{exact: true,},).last();
              await expect(accessPassLabel,).toBeVisible();
              const accessPassResultRow = accessPassLabel.locator("xpath=..",);
              await expect(accessPassResultRow,).toContainText( /\*{6,}/,);
              const copyAccessPassButton =accessPassResultRow.getByRole("button",{name: /copy/i,},);
              await expect(copyAccessPassButton,).toBeVisible();
              await expect(copyAccessPassButton,).toBeEnabled();

              await expectPageSnapshot(page,testInfo,`${user.role}-TAP-created.png`, {userId: user.role, viewportName:"Desktop", mask:sensitiveTextMasks(page,),},);
             } finally {
               await context.close();
             }
          },
        );
      }
    });
  }
});