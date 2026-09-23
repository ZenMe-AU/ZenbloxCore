import { app } from "@azure/functions";
import { corsWrapper } from "../utils/cors.js";

app.http("logout", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request) => {
    const redirectUri = request.query.get("redirect_uri") || "/";
    const hasEasyAuth = !!request.headers.get("x-ms-token-github-access-token");
    const location = hasEasyAuth
      ? `/auth/logout?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`
      : redirectUri;
    return { status: 302, headers: { Location: location } };
  }),
});
