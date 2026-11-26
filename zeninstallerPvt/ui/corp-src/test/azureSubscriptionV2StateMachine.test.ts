/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { initialState, reducer } from "../cards/AzureSubscriptionV2/stateMachine";

it("keeps scope, selection and populate state in the reducer", () => {
  const scoped = reducer(initialState, {
    type: "scope-synced",
    scopeKey: "home|tenant-1",
    selectedSubscriptionId: "subscription-1",
  });
  const selected = reducer(scoped, { type: "subscription-selected", subscriptionId: "subscription-2" });
  const saved = reducer(selected, { type: "transition", lifecycle: "saved" });

  expect(saved).toEqual({
    lifecycle: "saved",
    scopeKey: "home|tenant-1",
    selectedSubscriptionId: "subscription-2",
    populateCount: 1,
  });
});
