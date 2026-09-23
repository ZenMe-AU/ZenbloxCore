import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("checkTemplate", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const owner = request.query.get("owner");
    const repo = request.query.get("repo");

    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
    const templateName = data.template_repository?.full_name ?? undefined;
    return {
      jsonBody: { success: true, templateName },
    };
  }),
});
