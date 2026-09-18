import {expect,test } from "@playwright/test";
import {viewports} from "../../testInit";

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
  test.describe(`AP-${viewportName} - Tenant Outcome`, () => {
    test.use({viewport,deviceScaleFactor: 1,});
    test.skip(({ browserName }) => browserName !== "chromium","Saved Microsoft passkey sessions are only tested in Chromium.",);

    for (const user of users) {
      test.describe(user.id, () => {
        test.beforeEach(() => {
          const auth = getAccessPassUserAuth(user);
          test.skip(!auth.exists, [`Missing auth files for ${user.id}.`, `Expected storage: ${auth.storageStateFile}`,  `Expected session: ${auth.sessionStorageFile}`,].join(" "),);
        });

        test(`Tenant outcome is ${user.expectedEntraResult}`, async ({ browser }, testInfo) => {
            test.skip(!user.tenantId,  `No tenantId configured for ${user.id}.`,);

            const {page,  context,} = await openAuthenticatedAccessPassPage(browser,  user,  viewport,);

            try {
              // Verify authentication
              await expect(page.getByText("Access Pass").first()).toBeVisible({ timeout: 10_000 });
              await expect(
                page.getByText(new RegExp(`signed in as ${escapeRegExp(user.email)}`, "i")).first(),
              ).toBeVisible({ timeout: 10_000 });

              // Wait for Entra API response with auto-loaded tenant (buttons appear or fallback error/empty state)
              await page.waitForTimeout(2000); 

              // Verify expected outcome for this user
              switch (user.expectedEntraResult) {
                case "users": {
                  await expect(page.getByRole("button", { name: /create access pass/i }).first(),).toBeVisible({ timeout: 30_000 });
                  break;
                }

                case "empty": {
                  // Expect no buttons or buttons to disappear within reasonable time
                  const buttons = page.getByRole("button", { name: /create access pass/i });
                  
                  // Wait up to 45s for either no buttons or the expected message
                  try {
                    await expect(buttons).toHaveCount(0, { timeout: 45_000 });
                  } catch {
                    // If buttons didn't disappear, check if expected message is visible
                    if (user.expectedEntraMessage) {
                      await expect(page.getByText(new RegExp(escapeRegExp(user.expectedEntraMessage), "i")).first()).toBeVisible({ timeout: 10_000 });
                    }
                  }
                  break;
                }

                case "forbidden": {
                  // Expect no buttons and the forbidden message
                  await expect(page.getByRole("button", { name: /create access pass/i })).toHaveCount(0, { timeout: 30_000 });             
                  if (user.expectedEntraMessage) {
                    await expect(page.getByText(new RegExp(escapeRegExp(user.expectedEntraMessage), "i")).first()).toBeVisible({ timeout: 10_000 });
                  }
                  break;
                }

                default: {
                  throw new Error(`Unknown expected outcome: ${user.expectedEntraResult}`);
                }
              }
              // Snapshot the outcome
              await expectPageSnapshot(page,testInfo, `${user.expectedEntraResult}-tenant.png`,
                {userId: user.role, viewportName, mask: sensitiveTextMasks(page), stabilizeAuth: true,},);
            } finally {
              await context.close();
            }
          },
        );
      });
    }
  });
}