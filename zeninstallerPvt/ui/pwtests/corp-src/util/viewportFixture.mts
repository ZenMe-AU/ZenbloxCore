/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { test as playwrightTest, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { registerTestSourceFile } from "../../util/testHelper";
import { viewports } from "../../testInit";

type ViewportName = keyof typeof viewports;
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
    for (const viewportName of viewportNames) {
      const viewport = viewports[viewportName];
      const variantArgs = [...args];
      variantArgs[0] = `${String(title)} [${viewportName}]`;
      variantArgs[callbackIndex] = async ({ page, context }: { page: Page; context: BrowserContext }, testInfo: TestInfo) => {
        if (sourceFile) {
          registerTestSourceFile(testInfo, sourceFile);
        }
        await page.setViewportSize(viewport);
        return callback({ page, context }, testInfo);
      };
      Reflect.apply(target, target, variantArgs);
    }
  },
});

export function getViewportName(testInfo: TestInfo): ViewportName {
  const titleSuffix = testInfo.title.match(/\[([^\]]+)\]$/)?.[1];
  if (titleSuffix && viewportNames.includes(titleSuffix as ViewportName)) {
    return titleSuffix as ViewportName;
  }
  throw new Error(`Test title does not include a known viewport suffix: ${testInfo.title}`);
}