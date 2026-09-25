This function app is used by the zeninstaller to obtain a github api secret and to proxy all commands through to the github api.

Sign-in happens in the browser with OAuth PKCE. The frontend holds the GitHub access token and sends it as a bearer header, `Zb.Github.Authorization`; `getGhToken` is the one endpoint that talks to GitHub's token endpoint, because the exchange needs the client secret. Endpoints declare what they need with `requireAuth` in `src/utils/auth.js`.

For development you can skip the OAuth flow entirely: set `GITHUB_TOKEN` in local.settings.json to a personal access token and the backend authenticates as that user.

# Quick start

1. To start the backend, in the terminal run:
   `func start`

2. Login to github.
   Go to your personal settings > Develoer Settings > Personal Access Tokens > Fine-grained personal access tokens
   Generate a new token and call it zeninstallerLocal or similar.
