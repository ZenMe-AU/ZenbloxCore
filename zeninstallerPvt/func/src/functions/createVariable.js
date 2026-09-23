import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("createVariable", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const body = await request.json();
    const { owner, repo, env, name, value } = body;

    const octokit = new Octokit({ auth: accessToken });

    await octokit.request("POST /repos/{owner}/{repo}/environments/{environment_name}/variables", {
      owner,
      repo,
      environment_name: env,
      name,
      value,
    });

    return {
      jsonBody: { success: true, name, env },
    };
  }),
});
