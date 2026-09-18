/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

interface BufferedError {
  error: unknown;
  source: string;
}

const MAX_BUFFERED = 50;
const buffer: BufferedError[] = [];
let connected = false;

function capture(error: unknown, source: string) {
  if (connected) return; // ai's own window.onerror hook takes over once live
  if (buffer.length < MAX_BUFFERED) buffer.push({ error, source });
}

function formatErrorDetails(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "An unknown object error was thrown.";
    }
  }
  return "An unknown error occurred during startup.";
}

function showPageError(error?: unknown) {
  const root = document.getElementById("root");
  if (root && root.childElementCount === 0) {
    const container = document.createElement("div");
    container.style.padding = "32px";
    container.style.fontFamily = "sans-serif";
    container.style.color = "#b91c1c";
    container.style.textAlign = "center";

    const title = document.createElement("div");
    title.textContent = "Something went wrong while loading — please refresh the page.";

    const details = document.createElement("div");
    details.style.marginTop = "10px";
    details.style.fontSize = "14px";
    details.style.color = "#7f1d1d";
    details.textContent = `Error details: ${formatErrorDetails(error)}`;

    container.appendChild(title);
    container.appendChild(details);
    root.replaceChildren(container);
  }
}

window.addEventListener("error", (e) => {
  capture(e.error ?? e.message, "bootstrap:window.error");
  showPageError(e.error ?? e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  capture(e.reason, "bootstrap:unhandledrejection");
  showPageError(e.reason);
});

// Called by initMonitor once ai is loaded: flushes buffered errors, then hands off to the SDK.
export function connectBootstrapErrors(send: (error: unknown, source: string) => void) {
  connected = true;
  for (const { error, source } of buffer) send(error, source);
  buffer.length = 0;
}
