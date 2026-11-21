/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { cardLifecycleReducer, initialCardLifecycle } from "../components/cardLifecycle";

it("applies permitted lifecycle transitions and rejects invalid ones", () => {
  expect(() => cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "complete" })).toThrow();
  const loading = cardLifecycleReducer(initialCardLifecycle, { type: "transition", lifecycle: "loading" });
  const complete = cardLifecycleReducer(loading, { type: "transition", lifecycle: "complete" });
  expect(complete.lifecycle).toBe("complete");
  expect(initialCardLifecycle.lifecycle).toBe("blocked");
  expect(cardLifecycleReducer(complete, { type: "transition", lifecycle: "blocked" }).lifecycle).toBe("blocked");
});
