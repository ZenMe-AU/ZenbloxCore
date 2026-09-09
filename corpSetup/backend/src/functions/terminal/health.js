import { app } from "@azure/functions";
import { corsWrapper } from "../../utils/cors.js";
import { SESSION_TABLE_NAME, getTableClient } from "../../utils/sessionTable.js";

app.http("health", {
  methods: ["GET"],
  route: "terminal/health",
  authLevel: "anonymous",
  handler: corsWrapper(async () => {
    const { tableReadyPromise } = getTableClient();
    await tableReadyPromise;
    return { jsonBody: { status: "ok", sessionTable: SESSION_TABLE_NAME } };
  }),
});
