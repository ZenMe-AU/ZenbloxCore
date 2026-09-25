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

## Authenticated Session State
Session state is only needed for integration tests, not mock tests. 
It's recommended to refresh the session state for GitHub and Azure whenever starting a new session of work on integration tests.
The session state files are stored in /pwtests/corp-src/.auth can be refreshed by running the auth session state setup cards.

### To setup auth session state for cards that use Azure
Run the following test while showing the browser and letting the user authenticate: /pwtests/corp-src/setup/azure-login.setup.ts

### Setup auth session state for cards that use Github:
Ask the user if they want to use a PAT or backend. 

#### PAT path
If they want to use a PAT, they need to save the PAT into /.env as GITHUB_TOKEN
Then run the following test while showing the browser: /pwtests/corp-src/setup/github-pat-login.setup.ts

#### Backend path
Run the following test while showing the browser and letting the user authenticate: /pwtests/corp-src/setup/github-backend-login.setup.ts

## Notes to AI:
1. Always ask a human if they can be product owner and guide you through the steps.
2. Keep testing patterns in alignment, if it's not clear ask a human which pattern should be standard accross the test files.
3. When modifying tests, run Playwright with a headed browser and live terminal output (use `--reporter=line`) so that the human can follow the process. Do not open the HTML report during the run. Once the tests are confirmed working, headed mode is no longer needed.
4. If an of the integration tests for a card fails, ask the product owner if it's ok to continue with updating the mock test. By default only update mock tests that match integration tests that passed. For integration tests that fail, only check for glaring differences and recommend the product owner to request an update to them if needed.
5. When starting a new integration test, list the cards that are missing integration tests for the product owner to select which one to proceed with.
6. When creating a new integration test, use the AzureSubscriptionCard.spec.ts integration test as the example test file but also check for standards from the other integration tests.
7. When creating a new mock test, use the RepoDetail.spec.ts mock test as the example test file.
8. The expected user interaction is the "Happy Path" in the example test file and the other tests separate from the Happy Path are considered edge cases.
9. When creating the mock tests, follow the same structure as the existing integration tests with the Happy Path created first and then the edge case tests.
10. For any test being created, add an expectSnapshot() at the start of the Happy Path and at the end of each test.step(). For edge cases, add an expectSnapshot() only at the end of the test.

