import { app } from "@azure/functions";
import { corsWrapper } from "../../utils/cors.js";
import { HttpError, MissingParam } from "../../error/index.js";
import { SESSION_PARTITION_KEY, getTableClient } from "../../utils/sessionTable.js";

app.http("register", {
  methods: ["POST"],
  route: "terminal/register",
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const body = await request.json();
    const sessionId = body?.sessionId;
    const accessToken = body?.accessToken;
    const ttlSeconds = Number(body?.ttlSeconds || 1800);

    if (!sessionId || !accessToken) {
      throw MissingParam({ meta: { required: ["sessionId", "accessToken"] } });
    }

    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new HttpError(400, "ttlSeconds must be a positive number", { meta: { ttlSeconds } });
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    const { tableClient, tableReadyPromise } = getTableClient();
    await tableReadyPromise;

    await tableClient.upsertEntity(
      {
        partitionKey: SESSION_PARTITION_KEY,
        rowKey: sessionId,
        accessToken,
        expiresAt,
      },
      "Replace",
    );

    context.log(`Session registered: ${sessionId} (TTL ${ttlSeconds}s)`);
    return { jsonBody: { ok: true } };
  }),
});
