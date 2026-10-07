/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export async function handler(event) {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;

  const origin = request.headers.origin?.[0]?.value || null;

  if (origin) {
    response.headers["access-control-allow-origin"] = [{ key: "Access-Control-Allow-Origin", value: origin }];
    response.headers["access-control-allow-credentials"] = [{ key: "Access-Control-Allow-Credentials", value: "true" }];
    response.headers["vary"] = [{ key: "Vary", value: "Origin" }];
  }

  return response;
}
