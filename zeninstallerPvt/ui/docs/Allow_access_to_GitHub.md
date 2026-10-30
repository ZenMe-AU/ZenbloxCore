# Allow Zeninstaller access to GitHub

ZenInstaller uses a GitHub OAuth App (an app that lets users authorize sign-in with GitHub) so you can sign in with your GitHub account. This is separate from the AWS/Azure OIDC setup — this app is what lets people log **into ZenInstaller itself**.

Sign-in runs in the browser as an OAuth **authorization code flow with PKCE** (Proof Key for Code Exchange, which helps prevent an intercepted sign-in code from being reused). The frontend sends you to GitHub, GitHub returns a code to the frontend's own origin (the site's scheme, host, and port), and the backend's `getGhToken` endpoint swaps that code for an access token — the Client Secret never leaves the server.

## Using the GitHub login card

Open the **GitHub login** card and choose one of the available methods:

- **Backend:** Select **Sign in with GitHub** and authorize ZenInstaller on GitHub. The browser holds the access token for the session and sends it with requests through ZenInstaller's backend; the token is not stored on the server. After returning, the card should show **Authenticated as** and your GitHub username. This mode requires the deployment's OAuth app and backend to be configured.
- **Direct (PAT):** Paste a GitHub Personal Access Token and select **Connect with PAT**. The browser talks to GitHub directly; GitHub API requests do not go through ZenInstaller's backend. The card accepts tokens beginning with `ghp_` or `github_pat_` and recommends `repo + workflow` scopes. For a fine-grained token, grant access to the needed repositories and permissions for the actions you plan to perform.

Create tokens from GitHub's [personal access token settings](https://github.com/settings/personal-access-tokens). Your organization may restrict token types or require approval or SSO authorization. A recognized token format does not guarantee permission for every repository action.

If the token format is rejected, check that it starts with `ghp_` or `github_pat_` and remove surrounding spaces. If sign-in succeeds but a repository action fails, check that the token is active and has access and permissions for the target. For an OAuth or redirect error on a deployment you host, check the callback URL in Step 2; on a hosted deployment, contact its support channel. To switch accounts, sign out from the card and connect the other account.

> For local development, `GITHUB_TOKEN` in `zeninstallerPvt/func/local.settings.json` can be used by the Functions backend as a development fallback for GitHub API requests. It does not skip the GitHub OAuth sign-in in the card's **Backend** mode. To sign into the local UI without configuring an OAuth app, use **Direct (PAT)**. Do not commit `local.settings.json` or `.env` files.

## Step 1 — Add ZenInstaller app to your organisation

https://github.com/marketplace?query=zeninstaller

---

## Step 2 — Create the OAuth App

1. Go to [https://github.com/settings/developers](https://github.com/settings/developers) (or your GitHub organization's **Settings → Developer settings**, if the app should belong to an org).
2. Click **OAuth Apps → New OAuth App**.
3. Fill in:

	| Field                      | Value                                                           |
	| -------------------------- | --------------------------------------------------------------- |
	| Application name           | e.g. `ZenInstaller`                                             |
	| Homepage URL               | Your deployed frontend URL, e.g. `https://www.zeninstaller.com` |
	| Authorization callback URL | The same frontend URL, e.g. `https://www.zeninstaller.com`      |

4. Click **Register application**.

> The callback URL is the **frontend** origin, not the Function App. The frontend sends `redirect_uri` as its own `window.location.origin`, and GitHub requires the two to match exactly. For local development, use the origin shown in your browser: `http://localhost:5173`. Register a second OAuth App if the local callback differs from your deployed app's callback.

> You don't configure scopes here (scopes are the permissions the app asks GitHub to grant). The frontend requests `read:user`, `user:email`, and `repo` in the authorize URL (`GITHUB_SCOPES` in `corp-src/config/githubConfig.ts`).

---

## Step 3 — Generate a Client Secret

1. On the app's page, copy the **Client ID** shown at the top.
2. Click **Generate a new client secret**, then copy the value immediately — GitHub only shows it once.

---

## Step 4 — Put the values where each side needs them

The Client ID is public and belongs to the frontend; the Client Secret is not and belongs to the backend.

`web/.env`:

```
VITE_GITHUB_CLIENT_ID=<the Client ID from Step 3>
```

`deploy/.env`:

```
GITHUB_OAUTH_CLIENT_SECRET=<the Client Secret from Step 3>
```

For deployment, the deploy script pushes into Key Vault (Azure's service for storing secrets), never into Terraform state (Terraform's record of managed infrastructure). Terraform then wires that Key Vault reference into the Function App as an app setting of the same name, which is what `getGhToken` reads.

> Never put the Client Secret in a frontend `.env` file — anything with a `VITE_` prefix is compiled into the bundle and served to every visitor.

For local development, ensure the Functions app's `ALLOWED_ORIGINS` includes the origin shown in the browser.

---

## Step 5 — Update the callback URL if the frontend URL ever changes

Go back to the OAuth App's settings on GitHub and update **Authorization callback URL** whenever the frontend moves to a different origin — a custom domain, a new Pages URL, a different local port — otherwise sign-in fails with a redirect URI mismatch.
