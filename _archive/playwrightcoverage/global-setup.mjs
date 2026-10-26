import { rm } from "node:fs/promises";
import options from "./coverage-options.mjs";

export default async function coverageSetup() {
  await rm(options.outputDir, { recursive: true, force: true });
}