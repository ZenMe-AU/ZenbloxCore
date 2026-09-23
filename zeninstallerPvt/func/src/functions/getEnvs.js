import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getEnvs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const type = request.query.get("type");
    const owner = request.query.get("owner");
    const repo = request.query.get("repo");

    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.request(`GET /repos/{owner}/{repo}/environments`, { owner, repo });
    const envList = data.environments?.map((env) => ({ name: env.name, id: env.id, url: env.url }));
    return {
      jsonBody: { success: true, envList },
    };
  }),
});
