# PTR run notes

- Start from the 16 current PTR scope entries, then verify test headers against actual nested source paths. The RepoDetail suite also exercises the parent RepoCard flow, so do not infer coverage from spec filenames alone.
- Seven cards currently have no dedicated Playwright integration or mock suite: PrivateFrontendInfra, WebDeploy, AwsLogin, AwsSetup, Stage, AccessPass, and GlobalGroups.
- Keep Playwright runs small: the full suite can take tens of minutes, so run one or a few targeted suites at a time. Do not run all integration tests by default; several provision Azure resources or write GitHub repositories/environment variables. Prefer `playwright test --list` and targeted mock suites unless live provisioning has an explicit opt-in and disposable resources.
- Reuse `pwtests/corp-src/util` helpers. Replace fixed sleeps with state-based Playwright assertions when changing tests; avoid refactoring helpers without a demonstrated duplication or maintenance problem.
- Coverage files are test-run artifacts. The configured Playwright output directory is repository-root `pwtest-results`; verify this against the PTR coverage glob before concluding coverage is unavailable.
- Run Knip from the repository root with workspace name `zeninstallerPvtUi`. Review unused-code output before removal because runtime card registration can be indirect.
- The mock UI can show Azure Login as unavailable when `VITE_AZURE_CLIENT_ID` is absent; no local `zeninstallerPvt/ui/.env` is assumed. Supply a public test-only client ID in the test process rather than relying on developer-local configuration.
- Before starting Playwright runs, check that required test configuration is present and usable (including the effective `BASE_URL` and public `VITE_AZURE_CLIENT_ID` for UI mocks). Run one small, safe smoke test first; if configuration is missing or invalid, notify the user immediately and stop instead of spending time on a larger run.
- No separate complexity-only refactor is justified by this review; correctness and test-safety findings should be handled in the regular PTR findings instead.
