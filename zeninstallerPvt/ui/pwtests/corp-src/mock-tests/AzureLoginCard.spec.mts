/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// UI component: ../../../corp-src/cards/AzureLogin/AzureLoginCard.tsx
import { expect, test } from "@playwright/test";
import { installMockAzure, signInMockAzure } from "../util/mockTestHelper.mts";
import { CORP_URL, viewports } from "../../testInit";
import { expectSnapshot } from "../../util/testHelper.ts";
import { expandAzureLoginCard } from "../util/cardHelper.mts";
import { writeFile } from "fs/promises";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`Azure Login Card Mock - ${viewportName}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test.beforeEach(async ({ page }) => {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    });

    test.afterEach(async ({ page }, testInfo) => {
      if (page.isClosed()) {
        return;
      }

      const entries = await page.coverage.stopJSCoverage();
      const file = testInfo.outputPath("v8-coverage.json");
      await writeFile(file, JSON.stringify(entries), "utf8");
      await testInfo.attach("v8-coverage", {
        path: file,
        contentType: "application/json",
      });
    });

    test("Happy path", async ({ page }, testInfo) => {
      const card = await test.step("Expand unauthenticated Azure login card", async () => {
        await page.goto(CORP_URL);
        const result = await expandAzureLoginCard(page);
        await expectSnapshot(page, result, testInfo, "start", viewportName);
        return result;
      });

      await test.step("Signs in and selects the mocked tenant", async () => {
        await installMockAzure(page);
        await signInMockAzure(page);
        await expect(card.getByText(/Signed in as/i)).toBeVisible();
        await expect(card.getByTestId("txtAzureUsername")).toHaveText("mock-user@example.com");
        const tenantSelect = card.getByTestId("tenant-select");
        await expect(tenantSelect).toBeVisible();
        await tenantSelect.click();
        await page.getByRole("option", { name: /Mock tenant/i }).click();
        await expect(card.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
        await expectSnapshot(page, card, testInfo, "end", viewportName);
      });
    });

    test("Card header supports keyboard interaction and labels its region", async ({ page }) => {
      await page.goto(CORP_URL);
      const header = page.getByRole("banner");
      await expect(header.getByRole("heading", { level: 1, name: "Zenblox Core Environment Installer" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 2, name: "Deployment steps" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Help & information" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
      const main = page.getByRole("main");
      await expect(main).toHaveCount(1);
      const skipLink = page.getByRole("link", { name: "Skip to main content" });
      await expect(skipLink).toHaveAttribute("href", "#main-content");
      await page.keyboard.press("Tab");
      await expect(skipLink).toBeFocused();
      expect(await skipLink.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
      await page.keyboard.press("Enter");
      await expect(main).toBeFocused();

      const intro = page.locator("#installer-intro");
      await expect(intro.getByRole("listitem")).toHaveCount(2);
      await expect(intro.getByRole("link", { name: "GoDaddy" })).toHaveAttribute("href", "https://www.godaddy.com/");

      const card = page.locator("#card-azure_login");
      const toggle = card.getByRole("button", { name: /^Azure login,/ });
      await expect(toggle).toHaveAccessibleName(/^Azure login, /);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle.locator(".MuiTouchRipple-root")).toHaveCount(0);
      const titleText = card.locator("h3 button .MuiTypography-root").first();
      const summaryText = card.locator("h3 button .MuiTypography-root").nth(1);
      await expect(titleText).toHaveAttribute("title", "Azure login");
      await expect(summaryText).toHaveCSS("white-space", "normal");

      const contentId = await toggle.getAttribute("aria-controls");
      expect(contentId).toBeTruthy();
      const chevronToggle = card.getByRole("button", { name: "Expand Azure login" });
      await expect(chevronToggle).toHaveAttribute("aria-controls", contentId!);
      await expect(chevronToggle.locator(".MuiTouchRipple-root")).toHaveCount(0);
      const content = card.locator(`#${contentId}`);
      await expect(content).toHaveAttribute("role", "region");
      await expect(content).toHaveAttribute("aria-labelledby", "card-title-azure_login");

      await toggle.focus();
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await toggle.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
      await expect(content).toBeVisible();

      const popupPromise = page.waitForEvent("popup");
      await card.getByRole("link", { name: "View (opens in new tab)", exact: true }).click();
      const popup = await popupPromise;
      await popup.close();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(content).toBeHidden();

      await card.getByRole("button", { name: "Expand Azure login" }).click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(content).toBeVisible();
    });

    test("Global stylesheet exposes layout and accessibility rules", async ({ page }) => {
      await page.goto(CORP_URL);
      const layoutTokens = await page.locator("#root").evaluate((root) => {
        const styles = getComputedStyle(root);
        return {
          cardWidth: styles.getPropertyValue("--card-w").trim(),
          expandedWidth: styles.getPropertyValue("--card-w-expanded").trim(),
        };
      });
      expect(layoutTokens).toEqual({ cardWidth: "360px", expandedWidth: "1280px" });

      const visuallyHiddenStyle = await page.evaluate(() => {
        const element = document.createElement("span");
        element.className = "visually-hidden";
        document.body.append(element);
        const styles = getComputedStyle(element);
        const result = { position: styles.position, width: styles.width };
        element.remove();
        return result;
      });
      expect(visuallyHiddenStyle).toEqual({ position: "absolute", width: "1px" });

      const sensitiveFilter = await page.evaluate(() => {
        const element = document.createElement("span");
        element.setAttribute("data-sensitive", "true");
        document.documentElement.setAttribute("data-mask-sensitive", "true");
        document.body.append(element);
        const filter = getComputedStyle(element).filter;
        element.remove();
        document.documentElement.removeAttribute("data-mask-sensitive");
        return filter;
      });
      expect(sensitiveFilter).toBe("blur(5px)");

      await page.emulateMedia({ reducedMotion: "reduce" });
      const transitionDurations = await page.locator("#card-azure_login").evaluate((element) =>
        getComputedStyle(element)
          .transitionDuration.split(",")
          .map((duration) => Number.parseFloat(duration))
      );
      expect(transitionDurations.every((duration) => duration <= 0.00001)).toBe(true);
    });

    test("Locked prerequisite is keyboard accessible and preserves the source card", async ({ page }) => {
      await page.goto(CORP_URL);
      const stageCard = page.locator('[id^="card-stage_"]').first();
      const stageToggle = stageCard.locator("h3").getByRole("button");
      await stageToggle.click();
      await expect(stageToggle).toHaveAttribute("aria-expanded", "true");

      const contentId = await stageToggle.getAttribute("aria-controls");
      expect(contentId).toBeTruthy();
      const requirement = stageCard
        .locator(`#${contentId}`)
        .getByRole("button", { name: "Select a repository & environment", exact: true });
      await expect(requirement).toBeVisible();
      await requirement.focus();
      await page.keyboard.press("Enter");

      const repoToggle = page.locator("#card-repo h3").getByRole("button");
      await expect(repoToggle).toHaveAttribute("aria-expanded", "true");
      await expect(stageToggle).toHaveAttribute("aria-expanded", "true");
    });

    test("Signing Out button logs out current user", async ({ page }, testInfo) => {
      await page.goto(CORP_URL);
      await installMockAzure(page);
      const card = await expandAzureLoginCard(page);
      await signInMockAzure(page);
      await expect(card.getByText(/Signed in as/i)).toBeVisible();
      await card.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(card.getByText(/Signed in as/i)).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
      await expectSnapshot(page, card, testInfo, "signed-out", viewportName);
    });
  });
}
