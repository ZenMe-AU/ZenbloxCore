import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const fallbackWindowsPaths = [
  "C:\\Program Files\\Microsoft\\Azure Functions Core Tools\\func.exe",
  "C:\\Program Files (x86)\\Microsoft\\Azure Functions Core Tools\\func.exe",
];

function resolveFuncExecutable() {
  const envPath = process.env.FUNCTIONS_CORE_TOOLS_PATH?.trim();
  if (envPath && existsSync(envPath)) return envPath;

  for (const candidate of fallbackWindowsPaths) {
    if (existsSync(candidate)) return candidate;
  }

  return "func";
}

const funcExe = resolveFuncExecutable();
const child = spawn(funcExe, ["start", "--port", "7071"], {
  stdio: "inherit",
  shell: false,
});

child.on("error", (err) => {
  if ((err && typeof err === "object" && "code" in err && err.code === "ENOENT") || String(err).includes("ENOENT")) {
    console.error("Could not find Azure Functions Core Tools. Install it or set FUNCTIONS_CORE_TOOLS_PATH.");
    process.exit(1);
  }

  console.error(err);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
