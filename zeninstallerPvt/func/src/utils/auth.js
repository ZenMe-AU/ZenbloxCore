import { Unauthorized } from "../error/index.js";

/**
 * Returns the GitHub access token for the current request.
 *
 * Production (Azure App Service with Easy Auth):
 *   The token is injected automatically as x-ms-token-github-access-token.
 *
 * Local development fallback:
 *   Set GITHUB_TOKEN in local.settings.json.
 *   The app will authenticate as that user without needing an OAuth flow.
 */
export function getAccessToken(request) {
  const token = request.headers.get("x-ms-token-github-access-token");
  if (token) return token;

  // ── Local dev fallback ────────────────────────────────────────────────────
  const devToken = process.env.GITHUB_TOKEN;
  if (devToken) return devToken;

  throw Unauthorized({ meta: { reason: "not_authenticated" } });
}
