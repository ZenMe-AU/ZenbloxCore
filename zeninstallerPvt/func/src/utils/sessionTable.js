import { DefaultAzureCredential } from "@azure/identity";
import { InternalError, logError } from "../error/index.js";
import { TableClient } from "@azure/data-tables";

export const SESSION_PARTITION_KEY = "session";

const SESSION_TABLE_ACCOUNT_NAME = process.env.SESSION_TABLE_ACCOUNT_NAME;
export const SESSION_TABLE_NAME = process.env.SESSION_TABLE_NAME || "sessions";

// Module state, so the four functions sharing this module share one client and one create-table call.
let tableClient = null;
let tableReadyPromise = null;

export function getTableClient() {
  if (!SESSION_TABLE_ACCOUNT_NAME) {
    throw InternalError({ meta: { missing: "SESSION_TABLE_ACCOUNT_NAME" } });
  }

  if (!tableClient) {
    // The app's system-assigned identity holds Storage Table Data Contributor; no key is stored.
    const url = `https://${SESSION_TABLE_ACCOUNT_NAME}.table.core.windows.net`;
    tableClient = new TableClient(url, SESSION_TABLE_NAME, new DefaultAzureCredential());
  }

  if (!tableReadyPromise) {
    tableReadyPromise = tableClient.createTable().catch((err) => {
      // Ignore "table already exists" errors.
      if (err?.statusCode !== 409) {
        throw err;
      }
    });
  }

  return { tableClient, tableReadyPromise };
}

export async function deleteSessionEntity(sessionId) {
  const { tableClient, tableReadyPromise } = getTableClient();
  await tableReadyPromise;

  try {
    await tableClient.deleteEntity(SESSION_PARTITION_KEY, sessionId);
  } catch (err) {
    // A session that is already gone is the outcome the caller wanted; anything else is logged
    // rather than thrown, since both callers have already decided their own response.
    if (err?.statusCode !== 404) {
      logError(err);
    }
  }
}
