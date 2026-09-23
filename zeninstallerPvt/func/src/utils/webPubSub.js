import { DefaultAzureCredential } from "@azure/identity";
import { InternalError } from "../error/index.js";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

// The SDK wants a bare host, so any scheme or trailing slash is stripped rather than concatenated.
const WEBPUBSUB_ENDPOINT = process.env.WEBPUBSUB_ENDPOINT?.trim()
  .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  .replace(/\/+$/, "");
const HUB_NAME = process.env.HUB_NAME || "terminal";

let pubSubClient = null;

export function getPubSubClient() {
  if (!WEBPUBSUB_ENDPOINT) {
    throw InternalError({ meta: { missing: "WEBPUBSUB_ENDPOINT" } });
  }

  if (!pubSubClient) {
    pubSubClient = new WebPubSubServiceClient(`https://${WEBPUBSUB_ENDPOINT}`, new DefaultAzureCredential(), HUB_NAME);
  }

  return pubSubClient;
}

export function normalizeTokenResponse(tokenResponse) {
  if (typeof tokenResponse === "string") {
    return tokenResponse;
  }

  if (typeof tokenResponse?.url === "string") {
    return tokenResponse.url;
  }

  if (tokenResponse?.url && typeof tokenResponse.url.url === "string") {
    return tokenResponse.url.url;
  }

  throw InternalError({ meta: { reason: "unexpected_token_response", tokenResponse } });
}
