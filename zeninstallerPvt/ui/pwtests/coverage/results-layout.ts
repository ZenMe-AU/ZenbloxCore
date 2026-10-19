import type { Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function pathSegment(value: string, identity: string): string {
  const label = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "");
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 10);
  return `${label.slice(0, 60) || "unnamed"}--${hash}`;
}

function isInside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return relative !== "" && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

export async function organizeTestResult(
  test: TestCase,
  result: TestResult,
  outputDirectory: string,
  runTimestamp: Date,
): Promise<void> {
  let fileSuite: Suite = test.parent;
  const titles = [test.title];
  while (fileSuite.type !== "file") {
    if (fileSuite.type === "describe") titles.unshift(fileSuite.title);
    if (!fileSuite.parent) throw new Error(`Cannot identify the spec for test: ${test.title}`);
    fileSuite = fileSuite.parent;
  }

  const project = test.parent.project();
  const spec = fileSuite.title;
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${twoDigits(runTimestamp.getHours())}h ${twoDigits(runTimestamp.getMinutes())}m ${twoDigits(runTimestamp.getSeconds())}s - ${twoDigits(runTimestamp.getDate())}-${twoDigits(runTimestamp.getMonth() + 1)}-${runTimestamp.getFullYear()}`;
  const destination = path.join(
    outputDirectory,
    `[${timestamp}]${pathSegment(path.basename(spec), spec)}`,
    `${pathSegment(titles.join(" - "), JSON.stringify([test.id, project?.name]))}${test.repeatEachIndex ? `-repeat-${test.repeatEachIndex + 1}` : ""}${result.retry ? `-retry-${result.retry}` : ""}`,
  );
  const sourceDirectories = new Set<string>();
  for (const attachment of result.attachments) {
    if (!attachment.path || !isInside(outputDirectory, attachment.path)) continue;
    const segments = path.relative(outputDirectory, attachment.path).split(path.sep);
    if (segments.length < 2) continue;
    sourceDirectories.add(path.join(outputDirectory, segments[0]));
  }
  if (sourceDirectories.size > 1) {
    throw new Error(`Artifacts span multiple test directories for: ${test.title}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const [sourceDirectory] = sourceDirectories;
  if (sourceDirectory) {
    await rename(sourceDirectory, destination);
    for (const attachment of result.attachments) {
      if (attachment.path && isInside(sourceDirectory, attachment.path)) {
        attachment.path = path.join(destination, path.relative(sourceDirectory, attachment.path));
      }
    }
  } else {
    await mkdir(destination);
  }
  await writeFile(path.join(destination, "result.json"), JSON.stringify({
    spec,
    title: titles.join(" > "),
    testId: test.id,
    project: project?.name,
    startTime: result.startTime.toISOString(),
    duration: result.duration,
    retry: result.retry,
    repeatEachIndex: test.repeatEachIndex,
    status: result.status,
    errors: result.errors,
    attachments: result.attachments.map(({ name, contentType, path: attachmentPath }) => ({
      name,
      contentType,
      path: attachmentPath ? path.relative(destination, attachmentPath) : undefined,
    })),
  }, null, 2), "utf8");
}