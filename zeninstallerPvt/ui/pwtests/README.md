# Playwright Tests folder


This folder contain the playwright tests for this project. If you want to run tests, see [How to run tests](./Howto%20run%20tests.md), if you want to create tests, see below. 

For each card in /corp-src/cards there must be two .spec.ts files.
1. One (cardname).spec.ts file within /pwtests/corp-src/integration-tests that is an integrated test, testing against the actual backend systems.
1. One (cardname).spec.ts file within /pwtests/corp-src/mock-tests that is mocking the backend systems APIs, e.g. keeping all local browser capability, but removing cross network traffic.

Note: Folder paths are expressed from the root of this Node workspace.

When creating tests, always first create the integration test first and verify every step individually with a product owner.
Once the integration test correctly captures the business requirements then the mock test can be created from that.
Always ensure the mock test is in alignment with the integration test for that card, so that changes to the integration test is transfered to the mock test.

When reviewing and changing tests, work on one card at a time, completing the integration test and mock test before doing another card, under guidenance from the product owner.

## Environment preflight

Before running larger suites, run only `EnvironmentSmokeTest.spec.mts`:

```powershell
pnpm exec playwright test --config playwright.config.ts EnvironmentSmokeTest.spec.mts --workers=1
```

Run this command from the repository root with `BASE_URL=http://localhost:5173`
set for the Playwright web server. The preflight reads Vite's development
environment files in the UI workspace (including local overrides and process
environment variables). It checks the required Azure client ID, optional setting
formats, the GitHub OAuth client ID when the backend is enabled, and that the
installer and Azure sign-in button render without uncaught JavaScript errors.
Empty optional settings remain supported. It does not authenticate, provision
resources, or prove that credentials, permissions, or remote services work.

## Authenticated Session State
Session state is only needed for integration tests, not mock tests. 
It's recommended to refresh the session state for GitHub and Azure whenever starting a new session of work on integration tests.
The session state files are stored in /pwtests/corp-src/.auth can be refreshed by running the auth session state setup cards.

### To setup auth session state for cards that use Azure
Run the following test while showing the browser and letting the user authenticate: /pwtests/corp-src/setup/azure-login.setup.ts

### Setup auth session state for cards that use Github:
Ask the user if they want to use a PAT or backend. 

#### PAT path
Set GITHUB_TOKEN in the environment, the repository-root .env, or zeninstallerPvt/ui/pwtests/.env. Existing environment variables take precedence, followed by the root file and then the test-specific file.
Then run the following test while showing the browser: /pwtests/corp-src/setup/github-pat-login.setup.ts

#### Backend path
Run the following test while showing the browser and letting the user authenticate: /pwtests/corp-src/setup/github-backend-login.setup.ts

## Notes to AI:
Refer to the AI agent guidance at [PlaywrightTest-developer.md](/agents/playwrightTest-developer.md)

## Backend deployment card tests
[BackendDeployCard integration tests](./corp-src/integration-tests/BackendDeployCard.spec.mts)
reuse `pwtests-Desktop` and `pwtests-Mobile` with their existing `PROD` environment,
Azure target, and relay connection variables. They require saved GitHub PAT and
Azure sessions and an already configured Private Zeninstaller Environment.
Missing configuration fails the test; it does not create repositories, save
replacement variables, or provision infrastructure.
Running the integration happy path triggers `buildBackend.yml` and may deploy
backend code and update backend version settings on the existing Function App.
The happy path is skipped unless `RUN_BACKEND_DEPLOY_INTEGRATION=true` is set.
Enable it only with approval for those live changes.
[BackendDeployCard mock tests](./corp-src/mock-tests/BackendDeployCard.spec.mts)
simulate authentication, builds, artifact downloads, deployment, and version
read-back. They also cover missing artifacts, build failures, upload recovery,
and signed-out gating without contacting external services.
