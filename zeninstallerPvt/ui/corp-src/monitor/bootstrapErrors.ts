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

function showPageError() {
  const root = document.getElementById("root");
  if (root && root.childElementCount === 0) {
    root.innerHTML =
      '<div style="padding:32px;font-family:sans-serif;color:#b91c1c;text-align:center">' +
      "Something went wrong while loading — please refresh the page." +
      "</div>";
  }
}

window.addEventListener("error", (e) => {
  capture(e.error ?? e.message, "bootstrap:window.error");
  showPageError();
});

window.addEventListener("unhandledrejection", (e) => {
  capture(e.reason, "bootstrap:unhandledrejection");
});

// Called by initMonitor once ai is loaded: flushes buffered errors, then hands off to the SDK.
export function connectBootstrapErrors(send: (error: unknown, source: string) => void) {
  connected = true;
  for (const { error, source } of buffer) send(error, source);
  buffer.length = 0;
}
