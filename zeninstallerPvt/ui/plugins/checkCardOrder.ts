/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Logger, Plugin } from "vite";
import { existsSync, readdirSync, readFileSync } from "fs";
import { relative, resolve } from "path";
import { styleText } from "util";

// App ignores an id in config/cardOrder.ts that no card uses, and warns in the terminal
export default function checkCardOrder(): Plugin {
  let root: string;
  let logger: Logger;
  const check = () => {
    const src = resolve(root, "corp-src");
    const ids = readdirSync(resolve(src, "cards")).flatMap((dir) => {
      const index = resolve(src, "cards", dir, "index.ts");
      return existsSync(index) ? [...readFileSync(index, "utf8").matchAll(/^\s*id: "(\w+)"/gm)].map((m) => m[1]) : [];
    });
    const orderFile = resolve(src, "config/cardOrder.ts");
    const text = readFileSync(orderFile, "utf8");
    const list = text.match(/CARD_ORDER[^=]*=\s*\[[^\]]*\]/);
    for (const m of list?.[0].matchAll(/"(\w+)"/g) ?? []) {
      const id = m[1];
      if (ids.includes(id)) continue;
      const line = text.slice(0, list!.index! + m.index).split("\n").length;
      // A path:line from where dev runs, which editors' terminals open on click.
      logger.warn(
        `${styleText(["bold", "yellow"], "[WARN]")} Unknown card ID ${styleText(["bold", "yellow"], `"${id}"`)} in ` +
          `${relative(root, orderFile)}:${line}. ${styleText("dim", "Skipping.")}`
      );
    }
  };
  return {
    name: "check-card-order",
    configResolved: (config) => {
      root = config.root;
      logger = config.logger;
    },
    buildStart: check,
    handleHotUpdate: ({ file }) => {
      if (file.endsWith("config/cardOrder.ts") || file.endsWith("/index.ts")) check();
    },
  };
}
