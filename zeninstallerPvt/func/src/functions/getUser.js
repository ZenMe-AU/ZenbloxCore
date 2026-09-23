import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getUser", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.request("GET /user");
    return {
      jsonBody: { success: true, user: { login: data.login, id: data.id } },
    };
  }),
});
