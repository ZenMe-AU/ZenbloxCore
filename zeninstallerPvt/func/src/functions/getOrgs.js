import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getOrgs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);
    const octokit = new Octokit({ auth: accessToken });
    const all = await octokit.paginate("GET /user/orgs", { per_page: 100 });
    const orgList = all.map((org) => ({ login: org.login, id: org.id }));
    return {
      jsonBody: { success: true, orgList },
    };
  }),
});
