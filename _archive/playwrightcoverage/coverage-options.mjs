import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const uiRoot = fileURLToPath(new URL("../../", import.meta.url));

function workspaceSourcePath(sourcePath, { url, distFile }) {
  let localPath;
  if (URL.canParse(url)) {
    const sourceUrl = new URL(url);
    if (sourceUrl.protocol === "file:") {
      localPath = fileURLToPath(sourceUrl);
    } else if (sourceUrl.protocol === "http:" || sourceUrl.protocol === "https:") {
      const pathname = decodeURIComponent(sourceUrl.pathname);
      if (pathname.startsWith("/core/@fs/")) {
        localPath = pathname.slice("/core/@fs/".length);
      } else if (pathname.startsWith("/core/")) {
        localPath = resolve(uiRoot, pathname.slice("/core/".length));
      }
    }
  } else if (isAbsolute(url)) {
    localPath = url;
  } else if (distFile) {
    // Vite's inline maps use filenames relative to the transformed script.
    localPath = resolve(workspaceRoot, dirname(distFile), url);
  }
  return localPath ? relative(workspaceRoot, localPath).replace(/\\/g, "/") : sourcePath;
}

export default {
  name: "Playwright Coverage",
  baseDir: workspaceRoot,
  outputDir: fileURLToPath(new URL("../../../../pwtest-results/coverage/", import.meta.url)),
  reports: ["v8", "v8-json", "console-summary"],
  sourcePath: workspaceSourcePath,
  filter: {
    "**/node_modules/**": false,
    "**/corp-src/**": true,
    "**": false,
  },
  // Workers share the cache; only global setup may clear it.
  cleanCache: false,
};