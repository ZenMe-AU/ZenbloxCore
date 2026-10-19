import type { Reporter } from "@playwright/test/reporter";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default class CoverageReporter implements Reporter {
  async onEnd(): Promise<void> {
    const converter = fileURLToPath(new URL("./playwright-coverage.mjs", import.meta.url));
    const uiDirectory = fileURLToPath(new URL("../../", import.meta.url));
    execFileSync(process.execPath, [converter], { cwd: uiDirectory, stdio: "inherit"});
  }
}