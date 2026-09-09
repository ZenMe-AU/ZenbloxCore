import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getVariables", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);
    const owner = request.query.get("owner");
    const repo = request.query.get("repo");
    const env = request.query.get("env");

    const octokit = new Octokit({ auth: accessToken });

    const all = await octokit.paginate(
      "GET /repos/{owner}/{repo}/environments/{environment_name}/variables",
      {
        owner,
        repo,
        environment_name: env,
        per_page: 30,
      },
      (res) => res.data ?? [],
    );
    // Convert array to { NAME: value } map for easy lookup on the frontend
    const variables = Object.fromEntries(all.map(({ name, value }) => [name, value]));

    return {
      jsonBody: { success: true, variables },
    };
  }),
});
