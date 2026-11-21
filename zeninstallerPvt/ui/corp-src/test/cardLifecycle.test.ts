/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { cardLifecycleReducer, initialCardLifecycle } from "../components/cardLifecycle";

it("applies permitted lifecycle transitions and rejects invalid ones", () => {
  expect(() => cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "complete" })).toThrow();
  const ready = cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "ready" });
  const complete = cardLifecycleReducer(ready, { type: "transition", lifecycle: "complete" });
  expect(complete.lifecycle).toBe("complete");
  expect(initialCardLifecycle.lifecycle).toBe("loading");
  const blocked = cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "blocked" });
  expect(cardLifecycleReducer(blocked, { type: "transition", lifecycle: "loading" }).lifecycle).toBe("loading");
  expect(() => cardLifecycleReducer(blocked, { type: "transition", lifecycle: "ready" })).toThrow();
});
