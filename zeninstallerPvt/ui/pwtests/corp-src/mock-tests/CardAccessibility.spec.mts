/*
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CORP_URL } from "../../testInit";
import { expandAzureLoginCard } from "../util/cardHelper.mts";

async function expectAxeClean(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page }).exclude("[data-a11y-contrast-exception]").analyze();
  expect(violations, `Accessibility violations in ${state}`).toEqual([]);
}

test.describe("Installer accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
  });

  test("collapsed page has no axe violations", async ({ page }) => {
    await page.goto(CORP_URL);
    await expectAxeClean(page, "collapsed page");
  });

  test("long collapsed summaries do not change card height or accessible name", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(CORP_URL);

    const longSummary = "Signed in with " + "a-very-long-account-name ".repeat(8);
    const githubCard = page.locator("#card-github_login");
    const summary = githubCard.locator("h3 button span[title]").nth(1);
    await summary.evaluate((element, text) => {
      element.textContent = text;
      element.setAttribute("title", text);
    }, longSummary);

    const githubHeight = (await githubCard.boundingBox())?.height;
    const peerHeight = (await page.locator("#card-repo").boundingBox())?.height;
    expect(githubHeight).toBe(peerHeight);
    await expect(summary).toHaveAttribute("title", longSummary);
    await expect(githubCard.locator("h3 button")).toHaveAccessibleName(new RegExp(longSummary));
  });

  test("progress summary identifies and opens the next available card", async ({ page }) => {
    await page.goto(CORP_URL);

    const progressLabel = page.getByText("Deployment setup progress", { exact: true });
    await expect(progressLabel).toBeVisible();
    await expect(page.getByText("Deployment steps", { exact: true })).toHaveCount(0);
    await expect(page.getByText("0 of 20 tasks complete", { exact: true })).toHaveCount(0);
    const progressHeader = progressLabel.locator("..");
    await expect(progressHeader).toHaveCSS("display", "flex");
    await expect(progressHeader.getByRole("button", { name: "Next step: GitHub login" })).toBeVisible();
    await expect(progressHeader.locator("..")).toHaveCSS("margin-bottom", "8px");
    await expect(page.getByRole("progressbar", { name: "Deployment setup progress" })).toBeVisible();
    const intro = page.locator("#installer-intro");
    const footer = page.locator("footer > div");
    await expect(intro).toHaveCSS("background-color", "rgb(27, 38, 41)");
    await expect(footer).toHaveCSS("background-color", "rgb(27, 38, 41)");
    await expect(page.locator("#card-remote_terminal_infra h3 button")).toHaveAccessibleName(/Private Zeninstaller Backend Environment/);
    await expect(page.locator("#card-private_frontend_infra h3 button")).toHaveAccessibleName(/Frontend hosting environment/);

    const nextStep = page.getByRole("button", { name: "Next step: GitHub login" });
    await expect(nextStep).toBeVisible();
    await nextStep.click();
    await expect(page.locator("#card-github_login h3 button")).toHaveAttribute("aria-expanded", "true");
  });

  test("system color scheme follows browser preference and explicit modes persist", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(CORP_URL);

    const systemToggle = page.getByRole("button", { name: "Color scheme: System. Switch to light mode." });
    await expect(systemToggle).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");
    await expect(page.locator("#card-github_login")).toHaveCSS("background-color", "rgb(255, 255, 255)");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 13, 15)");

    await systemToggle.click();
    const lightToggle = page.getByRole("button", { name: "Color scheme: Light. Switch to dark mode." });
    await expect(lightToggle).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");

    await lightToggle.click();
    const darkToggle = page.getByRole("button", { name: "Color scheme: Dark. Switch to system mode." });
    await expect(darkToggle).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 13, 15)");

    await darkToggle.click();
    await expect(systemToggle).toHaveAccessibleName("Color scheme: System. Switch to light mode.");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 13, 15)");

    await systemToggle.click();
    await page.reload();
    await expect(lightToggle).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(lightToggle).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");

    await lightToggle.click();
    await page.reload();
    await expect(darkToggle).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 13, 15)");

    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toBeHidden();
    await expectAxeClean(page, "dark mode page");
  });

  test("system color scheme falls back to dark when browser preference is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    });
    await page.goto(CORP_URL);

    await expect(page.getByRole("button", { name: "Color scheme: System. Switch to light mode." })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 13, 15)");

    await page.getByRole("button", { name: "Color scheme: System. Switch to light mode." }).click();
    await page.getByRole("button", { name: "Color scheme: Light. Switch to dark mode." }).click();
    await page.getByRole("button", { name: "Color scheme: Dark. Switch to system mode." }).click();
    await expect(page.getByRole("button", { name: "Color scheme: System. Switch to light mode." })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 13, 15)");
  });

  test("footer shortcuts dialog lists keys, closes with Escape, and restores focus", async ({ page }) => {
    await page.goto(CORP_URL);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("heading", { name: "Help & information" })).toBeVisible();
    for (const heading of ["Keyboard shortcuts", "Contact", "Policies", "Support"]) {
      await expect(footer.getByRole("heading", { name: heading, exact: true })).toHaveCount(0);
    }
    const opener = page.getByRole("button", { name: "View keyboard shortcuts" });

    await expect(footer.getByText("Contact information coming soon.")).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy policy" })).toBeVisible();
    await expect(footer.getByText("Terms of use coming soon.")).toBeVisible();
    await expect(footer.getByRole("link", { name: "Support documentation" })).toBeVisible();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Open this shortcuts dialog, unless focus is in an editable field.")).toBeVisible();
    await expect(dialog.getByText("Move focus forward or backward between controls.")).toBeVisible();
    await expect(dialog.getByText("Activate the focused button, including card toggles.")).toBeVisible();
    await expect(dialog.getByText("Text fields and selects keep their normal browser keyboard behavior.")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("question mark opens shortcuts outside editable fields only", async ({ page }) => {
    await page.goto(CORP_URL);
    const opener = page.getByRole("button", { name: "View keyboard shortcuts" });
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });

    await opener.focus();
    await opener.evaluate((element) => element.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true })));
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    for (const [id, tag] of [["editable-input", "input"], ["editable-textarea", "textarea"], ["editable-select", "select"], ["editable-content", "div"]]) {
      await page.evaluate(([elementId, elementTag]) => {
        const element = document.createElement(elementTag);
        element.id = elementId;
        if (elementTag === "div") element.setAttribute("contenteditable", "true");
        document.body.append(element);
      }, [id, tag]);
      const editable = page.locator(`#${id}`);
      await editable.focus();
      await editable.evaluate((element) => element.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true })));
      await expect(dialog).toBeHidden();
      await editable.evaluate((element) => element.remove());
    }
  });

  test("expanded Azure Login card has no axe violations", async ({ page }) => {
    await page.goto(CORP_URL);
    await expandAzureLoginCard(page);
    await expectAxeClean(page, "expanded Azure Login card");
  });

  test("expanded locked card has no axe violations", async ({ page }) => {
    await page.goto(CORP_URL);
    const card = page.locator('[id^="card-stage_"]').first();
    const toggle = card.locator("h3").getByRole("button");
    await expect(toggle).toHaveAccessibleName(/Locked/);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(card.getByRole("button", { name: "Select a repository & environment", exact: true })).toBeVisible();
    await expectAxeClean(page, "expanded locked card");
  });

  test("320px reflow and accessibility media preferences preserve the page and card boundary", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.goto(CORP_URL);
    const modeToggle = page.getByRole("button", { name: "Color scheme: System. Switch to light mode." });
    await expect(modeToggle).toBeVisible();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(modeToggle).toBeFocused();

    const githubCard = page.locator("#card-github_login");
    const cardToggle = githubCard.locator("h3 button");
    let cardToggleFocused = false;
    for (let attempt = 0; attempt < 100 && !cardToggleFocused; attempt += 1) {
      await page.keyboard.press("Tab");
      cardToggleFocused = await cardToggle.evaluate((element) => element === document.activeElement);
    }
    expect(cardToggleFocused).toBe(true);
    await expect(cardToggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(cardToggle).toHaveAttribute("aria-expanded", "true");

    const layout = await page.evaluate(() => {
      const card = document.getElementById("card-github_login");
      if (!card) throw new Error("GitHub Login card is missing");
      const transitionDuration = getComputedStyle(card).transitionDuration.split(",")[0].trim();
      const durationInSeconds = Number.parseFloat(transitionDuration) * (transitionDuration.endsWith("ms") ? 0.001 : 1);
      const title = card.querySelector("h3 button");
      const input = card.querySelector("input[placeholder]");
      if (!title) throw new Error("GitHub Login title is missing");
      const activeElement = document.activeElement;
      return {
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        cardBorderStyle: getComputedStyle(card).borderTopStyle,
        cardBorderWidth: getComputedStyle(card).borderTopWidth,
        cardForcedColorAdjust: getComputedStyle(card).forcedColorAdjust,
        cardRight: card.getBoundingClientRect().right,
        titleColor: getComputedStyle(title).color,
        focusOutlineStyle: activeElement ? getComputedStyle(activeElement).outlineStyle : "none",
        focusOutlineWidth: activeElement ? getComputedStyle(activeElement).outlineWidth : "0px",
        inputLeft: input?.getBoundingClientRect().left ?? null,
        inputRight: input?.getBoundingClientRect().right ?? null,
        durationInSeconds,
      };
    });

    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.cardBorderStyle).not.toBe("none");
    expect(Number.parseFloat(layout.cardBorderWidth)).toBeGreaterThan(0);
    expect(layout.cardForcedColorAdjust).toBe("auto");
    expect(layout.cardRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.titleColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(layout.focusOutlineStyle).toBe("solid");
    expect(Number.parseFloat(layout.focusOutlineWidth)).toBeGreaterThanOrEqual(2);
    if (layout.inputLeft !== null) expect(layout.inputLeft).toBeGreaterThanOrEqual(0);
    if (layout.inputRight !== null) expect(layout.inputRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.durationInSeconds).toBeLessThanOrEqual(0.001);
  });

  test("Tab reaches every card title and Enter or Space toggles it", async ({ page }) => {
    await page.goto(CORP_URL);
    const titles = page.locator('main h3 button[aria-controls^="card-content-"]');
    const count = await titles.count();
    const visited = new Set<string>();

    for (let attempt = 0; attempt < 200 && visited.size < count; attempt += 1) {
      await page.keyboard.press("Tab");
      const controls = await page.evaluate(() => {
        const activeElement = document.activeElement;
        return activeElement instanceof HTMLButtonElement && activeElement.matches('h3 button[aria-controls^="card-content-"]')
          ? activeElement.getAttribute("aria-controls")
          : null;
      });
      if (controls) visited.add(controls);
    }

    expect(visited.size).toBe(count);

    for (let index = 0; index < count; index += 1) {
      const toggle = titles.nth(index);
      const key = index % 2 === 0 ? "Enter" : "Space";
      await toggle.focus();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press(key);
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press(key);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
  });
});
