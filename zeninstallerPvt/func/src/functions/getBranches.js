import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getBranches", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const octokit = new Octokit({ auth: accessToken });
    const owner = request.query.get("owner");
    const repo = request.query.get("repo");
    // const type = request.query.get("type");

    const all = await octokit.paginate("GET /repos/{owner}/{repo}/branches", { owner, repo, per_page: 100 });
    const branchList = all.map((branch) => ({ name: branch.name, commit: branch.commit.sha, protected: branch.protected }));
    return {
      jsonBody: { success: true, branches: branchList },
    };
  }),
});
