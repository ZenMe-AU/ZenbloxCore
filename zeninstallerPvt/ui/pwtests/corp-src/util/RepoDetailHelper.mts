/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type Locator, type Page } from "@playwright/test";

export async function selectCloneOption(page: Page, card: Locator, name: string) {
  const input = card.getByRole("combobox", { name: "Select or type repo name..." });
  await input.fill(name);
  await page.getByRole("option", { name: new RegExp(`^Clone as ["'“‘]${name}["'”’]$`) }).click();
  await expect(card.getByRole("button", { name: "Clone Repository", exact: true })).toBeEnabled();
  return card.getByRole("button", { name: "Clone Repository", exact: true });
}
