/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export async function githubResponseError(response: Response, action: string): Promise<Error> {
  const text = await response.text();
  let detail = text;
  try {
    const data: unknown = JSON.parse(text);
    if (data && typeof data === "object") {
      if ("message" in data && typeof data.message === "string") detail = data.message;
      else if ("error" in data && typeof data.error === "string") detail = data.error;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return new Error(`${action}: ${response.status}${detail ? ` - ${detail}` : ""}`);
}
