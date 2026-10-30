/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import { test as playwrightTest } from "./coverage-fixture.mjs";
import { fileURLToPath } from "node:url";
import { registerTestSourceFile } from "./testHelper.js";

export const viewports = {
  Desktop: { width: 1280, height: 720 },
  Mobile: { width: 414, height: 896 },
} as const;

type ViewportName = keyof typeof viewports;
type Theme = "dark" | "light";
const viewportNames = Object.keys(viewports) as ViewportName[];

function getSourceTestFile(): string | undefined {
  const stack = new Error().stack?.split("\n") ?? [];
  for (const frame of stack) {
    const match = frame.match(/((?:file:\/\/\/|[A-Za-z]:[\\/]|\/)[^()\r\n]*?\.spec\.(?:m?[jt]sx?)):\d+:\d+\)?$/);
    if (match) {
      return match[1].startsWith("file:///") ? fileURLToPath(match[1]) : match[1];
    }
  }
}

export const test = new Proxy(playwrightTest, {
  apply(target, _thisArg, args) {
    const [title, secondArgument, thirdArgument] = args;
    const callbackIndex = typeof secondArgument === "function" ? 1 : 2;
    const callback = args[callbackIndex];

    if (typeof callback !== "function") {
      return Reflect.apply(target, target, args);
    }

    const sourceFile = getSourceTestFile();
    const isMock = /[\\/]mock-tests[\\/]/.test(sourceFile ?? "");
    const themes: Theme[] = isMock && /^happy path/i.test(String(title)) ? ["dark", "light"] : ["dark"];
    for (const theme of themes) {
      for (const viewportName of viewportNames) {
        const viewport = viewports[viewportName];
        const variantArgs = [...args];
        variantArgs[0] = `${String(title)} [${viewportName}${theme === "light" ? "-light" : ""}]`;
        variantArgs[callbackIndex] = async ({ page, context }: { page: Page; context: BrowserContext }, testInfo: TestInfo) => {
          if (sourceFile) {
            registerTestSourceFile(testInfo, sourceFile);
          }
          await page.addInitScript((mode) => localStorage.setItem("zeninstaller-corp-mode", mode), theme);
          await page.setViewportSize(viewport);
          return callback({ page, context }, testInfo);
        };
        Reflect.apply(target, target, variantArgs);
      }
    }
  },
});

// Light-mode variants return e.g. "Desktop-light" so their snapshots live in a separate directory.
export function getViewportName(testInfo: TestInfo): string {
  const titleSuffix = testInfo.title.match(/\[([^\]]+)\]$/)?.[1];
  const baseName = titleSuffix?.replace(/-light$/, "");
  if (titleSuffix && baseName && viewportNames.includes(baseName as ViewportName)) {
    return titleSuffix;
  }
  throw new Error(`Test title does not include a known viewport suffix: ${testInfo.title}`);
}