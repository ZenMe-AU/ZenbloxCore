import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("deleteVariable", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const body = await request.json();
    const { owner, repo, env, name } = body;

    const octokit = new Octokit({ auth: accessToken });

    await octokit.request("DELETE /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}", {
      owner,
      repo,
      environment_name: env,
      name,
    });

    return {
      jsonBody: { success: true, name, env },
    };
  }),
});
