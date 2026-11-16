/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import Prerequisites from "../components/Prerequisites";

it("keeps prerequisite sections independent and exposes their content accessibly", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);

  function Harness() {
    const [accessOpen, setAccessOpen] = useState(false);
    const [stageOpen, setStageOpen] = useState(false);
    return (
      <>
        <Prerequisites id="access-prerequisites" open={accessOpen} onToggle={() => setAccessOpen((open) => !open)}>
          Access check
        </Prerequisites>
        <Prerequisites id="stage-prerequisites" open={stageOpen} onToggle={() => setStageOpen((open) => !open)} stage>
          Stage requirements
        </Prerequisites>
      </>
    );
  }

  try {
    await act(async () => root.render(<Harness />));
    const access = container.querySelector<HTMLButtonElement>('[aria-controls="access-prerequisites"]')!;
    const stage = container.querySelector<HTMLButtonElement>('[aria-controls="stage-prerequisites"]')!;
    expect(access.getAttribute("aria-expanded")).toBe("false");
    expect(stage.getAttribute("aria-label")).toBe("open prerequisites");
    await act(async () => access.click());
    expect(access.getAttribute("aria-expanded")).toBe("true");
    expect(stage.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('#access-prerequisites[role="region"]')?.textContent).toBe("Access check");
    await act(async () => stage.click());
    expect(stage.getAttribute("aria-label")).toBe("collapse");
    expect(container.querySelector('#stage-prerequisites[role="region"]')?.textContent).toBe("Stage requirements");
  } finally {
    await act(async () => root.unmount());
  }
});
