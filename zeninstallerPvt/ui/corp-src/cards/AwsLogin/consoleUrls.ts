/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/*
 * Deep links into the providers' own consoles, for each card's "view" action.
 * Azure resource links follow the documented portal form: #@{tenant}/resource{resourceId}/overview.
 */

// ── AWS ───────────────────────────────────────────────────────────────────────

export function getAwsConsoleUrl(): string {
  return "https://console.aws.amazon.com/console/home";
}
