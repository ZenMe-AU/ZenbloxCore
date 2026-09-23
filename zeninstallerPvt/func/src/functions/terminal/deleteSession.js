import { app } from "@azure/functions";
import { corsWrapper } from "../../utils/cors.js";
import { MissingParam } from "../../error/index.js";
import { deleteSessionEntity } from "../../utils/sessionTable.js";

app.http("deleteSession", {
  methods: ["DELETE"],
  route: "terminal/session/{id}",
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const sessionId = request.params.id;

    if (!sessionId) {
      throw MissingParam({ meta: { required: ["id"] } });
    }

    await deleteSessionEntity(sessionId);
    context.log(`Session cleaned up: ${sessionId}`);
    return { jsonBody: { ok: true } };
  }),
});
