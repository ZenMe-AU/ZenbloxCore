import {expect,test } from "@playwright/test";
import {viewports,} from "../../testInit";
import {
  escapeRegExp,
  expectPageSnapshot,
  getAccessPassUserAuth,
  loadAccessPassUsers,
  openAuthenticatedAccessPassPage,
  sensitiveTextMasks,
} from "../testHelper";

const users = loadAccessPassUsers({softFail: true,});
test.skip(() => users.length === 0,"No local Access Pass users file was found. Authenticated tests are skipped.",);

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - Entra User Actions`, () => {
    test.use({viewport,deviceScaleFactor: 1,});

    test.skip(({ browserName }) => browserName !== "chromium","Saved Microsoft passkey sessions are only tested in Chromium.",);

    for (const user of users) {
      if (user.expectedEntraResult !== "users") {
        continue;
      }

      const targets = user.targetEntraUsers ?? [];

      test.describe(user.id, () => {
        test.beforeEach(() => {
          const auth = getAccessPassUserAuth(user);
          test.skip(!auth.exists, [`Missing auth files for ${user.id}.`, `Expected storage: ${auth.storageStateFile}`, `Expected session: ${auth.sessionStorageFile}`,].join(" "),);
        });
        
        // This test waits for the existing authenticated sessions to load its Entra users and verifies their action buttons.
        test("Access Pass actions are available for configured Entra users",async ({ browser }, testInfo) => {
            test.skip(!user.tenantId,`No tenantId configured for ${user.id}.`,);
            test.skip(targets.length === 0,`No target Entra users configured for ${user.id}.`,);

            const {page, context,} = await openAuthenticatedAccessPassPage(browser,user,viewport,);

            try {
              await expect(page.getByText("Access Pass").first()).toBeVisible({ timeout: 10_000 });
              await expect(
                page.getByText(new RegExp(`signed in as ${escapeRegExp(user.email)}`, "i")).first(),).toBeVisible({ timeout: 10_000 });

              const userTable = page.getByRole("table");
              await expect(userTable,"Expected the Entra-user table to load.",).toBeVisible({timeout: 45_000,}).catch(async (err) => {
                console.log("BODY HTML:", await page.locator("body").innerHTML());
                throw  err;
            });

              // Verify each target user has an action button
              for (const target of targets) {
                await test.step(`Verify Access Pass action for ${target.id}`, async () => {
                     const targetRow = userTable.getByRole("row").filter({hasText: new RegExp(escapeRegExp(target.email,),"i",),});

                    await expect(targetRow, `Expected one Entra-user row for ${target.email}.`,).toHaveCount( 1, {timeout: 30_000,});
                    await expect(targetRow,`Expected the row for ${target.email} to be visible.`,).toBeVisible();
                                       
                    if (target.displayName) {
                      await expect(targetRow,).toContainText(target.displayName,);
                    }

                    // Find Create Access Pass button for this target user
                    const createAccessPassButton =targetRow.getByRole("button", {name:"Create Access Pass", exact:true,},);
                    await expect(createAccessPassButton, `Expected one Create Access Pass button for ${target.email}.`,).toHaveCount(1);
                    await expect(createAccessPassButton,).toBeVisible();
                    await expect(createAccessPassButton,`Expected the Create Access Pass button for ${target.email} to be enabled.`,).toBeEnabled();
                  },
                );
              }

              // All configured target rows and buttons are ready.
              await expectPageSnapshot(page, testInfo,"entra-users.png", {userId: user.role, viewportName, mask:sensitiveTextMasks(page),},);
            } finally {
              await context.close();
            }
          },
        );
      });
    }
  });
}