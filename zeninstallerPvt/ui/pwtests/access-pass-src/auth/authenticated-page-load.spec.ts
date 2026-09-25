// Verifies authenticated users can load Access Pass and see expected post-login state.

import {expect,test,} from "@playwright/test";
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
  test.describe(`AP-${viewportName} - Authenticated Page Load`, () => {
    test.use({viewport,deviceScaleFactor: 1,});
    test.skip(({ browserName }) => browserName !== "chromium","Saved Microsoft passkey sessions are only tested in Chromium.",);

    for (const user of users) {test.describe(user.id, () => { 
      test.beforeEach(() => {
          const auth = getAccessPassUserAuth(user);
          test.skip(!auth.exists,
            [ `Missing auth files for ${user.id}.`,
              `Expected storage: ${auth.storageStateFile}`,
              `Expected session: ${auth.sessionStorageFile}`,
            ].join(" "),
          );
        });

        test("User loads Access Pass page", async ({browser,}, testInfo) => {
          const {page, context,} = await openAuthenticatedAccessPassPage( browser,user,viewport,);

          try {
            // Wait for core authentication elements
            await expect(page.getByText("Access Pass").first()).toBeVisible({ timeout: 10_000 });
            await expect(page.getByText(new RegExp(`signed in as ${escapeRegExp(user.email)}`, "i"),).first(),).toBeVisible({ timeout: 10_000 });
            await expect(page.getByText(/Azure Login/i).first()).toBeVisible({ timeout: 10_000 });
            await expect(page.getByText(/Azure Access Pass/i).first()).toBeVisible({ timeout: 10_000 });
            // Wait for user-specific post-login content
            await expect(page.getByText(new RegExp(escapeRegExp(user.expectedPostLoginText), "i"),).first(),).toBeVisible({ timeout: 10_000 });
            // Snapshot the authenticated page state
            await expectPageSnapshot(page,testInfo,"page-rendered.png", {userId: user.role, viewportName,mask: sensitiveTextMasks(page),stabilizeAuth: true,},);
          } finally {
            await context.close();
          }
        });
      });
    }
  });
}