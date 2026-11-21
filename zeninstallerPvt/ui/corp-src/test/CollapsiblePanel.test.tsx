/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import CollapsiblePanel from "../components/CollapsiblePanel";

it("keeps panels independent and exposes their labels and content accessibly", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);

  function Harness() {
    const [accessOpen, setAccessOpen] = useState(false);
    const [stageOpen, setStageOpen] = useState(false);
    const [resultsOpen, setResultsOpen] = useState(false);
    return (
      <>
        <CollapsiblePanel label="Prerequisites" id="access-prerequisites" open={accessOpen} onToggle={() => setAccessOpen((open) => !open)}>
          Access check
        </CollapsiblePanel>
        <CollapsiblePanel label="Prerequisites" id="stage-prerequisites" open={stageOpen} onToggle={() => setStageOpen((open) => !open)} stage>
          Stage requirements
        </CollapsiblePanel>
        <CollapsiblePanel label="Results" id="results" open={resultsOpen} onToggle={() => setResultsOpen((open) => !open)}>
          Result details
        </CollapsiblePanel>
      </>
    );
  }

  try {
    await act(async () => root.render(<Harness />));
    const access = container.querySelector<HTMLButtonElement>('[aria-controls="access-prerequisites"]')!;
    const stage = container.querySelector<HTMLButtonElement>('[aria-controls="stage-prerequisites"]')!;
    const results = container.querySelector<HTMLButtonElement>('[aria-controls="results"]')!;
    expect(access.getAttribute("aria-expanded")).toBe("false");
    expect(access.getAttribute("aria-label")).toBe("View prerequisites");
    expect(stage.getAttribute("aria-label")).toBe("open prerequisites");
    expect(results.getAttribute("aria-label")).toBe("View results");
    await act(async () => access.click());
    expect(access.getAttribute("aria-expanded")).toBe("true");
    expect(stage.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('#access-prerequisites[role="region"]')?.textContent).toBe("Access check");
    await act(async () => stage.click());
    expect(stage.getAttribute("aria-label")).toBe("collapse");
    expect(container.querySelector('#stage-prerequisites[role="region"]')?.textContent).toBe("Stage requirements");
    await act(async () => results.click());
    expect(results.getAttribute("aria-label")).toBe("Collapse results");
    expect(container.querySelector('#results[role="region"]')?.getAttribute("aria-label")).toBe("Results");
    expect(container.querySelector('#results[role="region"]')?.textContent).toBe("Result details");
  } finally {
    await act(async () => root.unmount());
  }
});
