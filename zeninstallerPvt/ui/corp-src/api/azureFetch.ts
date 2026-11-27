/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export const GRAPH = "https://graph.microsoft.com/v1.0";
export const ARM = "https://management.azure.com";

// Same message as before; status and Retry-After ride along so a caller can tell throttling from a real failure.
export class AzureHttpError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "AzureHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// Retry-After is either seconds or an HTTP date.
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

// Shared by every Azure REST call, Graph and ARM alike — the base URL is the only difference.
export async function azFetch(token: string, base: string, path: string, options?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AzureHttpError(res.status, `${res.status} ${path}: ${body}`, retryAfterMs(res.headers?.get?.("Retry-After") ?? null));
  }

  const text = await res.text();
  if (text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      // Name the call and show where it stopped being JSON, instead of a bare position number.
      throw new Error(`${path}: response was not JSON (${(err as Error).message}) — ${text.slice(0, 200)}`);
    }
  }
  if (res.status === 202 || res.status === 204) return null;
  throw new Error(`${res.status} ${path}: expected a JSON body but got none`);
}
