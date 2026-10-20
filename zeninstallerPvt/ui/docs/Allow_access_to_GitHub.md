# Allow Zeninstaller access to GitHub

ZenInstaller uses a GitHub OAuth App so users can sign in with their GitHub account. This is separate from the AWS/Azure OIDC setup — this app is what lets people log **into ZenInstaller itself**.

Sign-in runs in the browser as an OAuth **authorization code flow with PKCE**. The frontend sends the user to GitHub, GitHub returns a code to the frontend's own origin, and the backend's `getGhToken` endpoint swaps that code for an access token — the Client Secret never leaves the server.

> Skip this if you only want to run ZenInstaller locally — set `GITHUB_TOKEN` in `backend/local.settings.json` to a personal access token instead, and the backend will authenticate as that user without needing an OAuth flow at all.

---

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

> The callback URL is the **frontend** origin, not the Function App. The frontend sends `redirect_uri` as its own `window.location.origin`, and GitHub requires the two to match exactly. For local development register a second OAuth App with `http://localhost:5173`.

> You don't configure scopes here — the frontend requests `read:user`, `user:email`, and `repo` in the authorize URL (`SCOPES` in `corp-src/logic/githubAuth.ts`).

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

The deploy script pushes it into Key Vault, never into Terraform state. Terraform then wires that Key Vault reference into the Function App as an app setting of the same name, which is what `getGhToken` reads.

> Never put the Client Secret in `web/.env` — anything with a `VITE_` prefix is compiled into the bundle and served to every visitor.

---

## Step 5 — Update the callback URL if the frontend URL ever changes

Go back to the OAuth App's settings on GitHub and update **Authorization callback URL** whenever the frontend moves to a different origin — a custom domain, a new Pages URL, a different local port — otherwise sign-in fails with a redirect URI mismatch.
