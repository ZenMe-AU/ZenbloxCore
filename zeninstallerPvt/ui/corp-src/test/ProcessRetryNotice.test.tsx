import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it } from "vitest";
import ProcessRetryNotice from "../components/ProcessRetryNotice";

describe("ProcessRetryNotice", () => {
  it("is hidden before the process starts", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => root.render(React.createElement(ProcessRetryNotice, { started: false })));
      expect(container.querySelector('[role="note"]')).toBeNull();
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  it("gives static retry guidance without live-region semantics", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => root.render(React.createElement(ProcessRetryNotice, { started: true })));

      const note = container.querySelector('[role="note"]');
      expect(note?.textContent).toBe("If one or more steps fail, try running the process again.");
      expect(note?.hasAttribute("aria-live")).toBe(false);
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });
});
