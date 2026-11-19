/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { RoleAssignment } from "../types";

// A check that ran and found something missing, as opposed to one that couldn't run; the card shows it as a warning.
export class MissingAccessError extends Error {
  name = "MissingAccessError";
}

// Role definition ids that apply at a scope: assignments at it or above it, each once.
// For a subscription or narrower scope, a management group or root assignment is above it.
export function roleIdsAtScope(assignments: readonly RoleAssignment[], scope: string): string[] {
  const target = scope.toLowerCase();
  const above = (assigned: string) => {
    const at = assigned.toLowerCase().replace(/\/$/, "");
    return !at.startsWith("/subscriptions/") || target === at || target.startsWith(`${at}/`);
  };
  return [...new Set(assignments.filter((assignment) => above(assignment.scope)).map((assignment) => assignment.roleDefinitionId))];
}
