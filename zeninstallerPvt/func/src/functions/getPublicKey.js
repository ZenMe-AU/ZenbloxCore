import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getPublicKey", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const owner = request.query.get("owner");
    const repo = request.query.get("repo");
    const env = request.query.get("env");

    const octokit = new Octokit({ auth: accessToken });

    const uri = env
      ? "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key"
      : "GET /repos/{owner}/{repo}/actions/secrets/public-key";

    const params = {
      owner,
      repo,
      environment_name: env,
    };

    const { data } = await octokit.request(uri, params);

    return {
      jsonBody: {
        success: true,
        key: data.key,
        keyId: data.key_id,
      },
    };
  }),
});
