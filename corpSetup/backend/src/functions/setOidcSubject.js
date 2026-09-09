import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("setOidcSubject", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const body = await request.json();
    const { owner, repo } = body;

    const octokit = new Octokit({ auth: accessToken });

    // Opts the repo into GitHub's immutable OIDC subject, so the sub claim carries owner/repo ids.
    await octokit.request("PUT /repos/{owner}/{repo}/actions/oidc/customization/sub", {
      owner,
      repo,
      use_default: false,
      include_claim_keys: ["repo", "environment"],
      use_immutable_subject: true,
    });

    return {
      jsonBody: { success: true, owner, repo },
    };
  }),
});
