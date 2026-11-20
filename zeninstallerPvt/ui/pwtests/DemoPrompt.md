# AI Agent Demo

## AzureResourcesCard.tsx UI Component and Playwright Tests

### Prompt 1 (PTR.md and PTD.md attached)
Create a new card after "Choose Azure Subscription" that calls Azure API to list all resources in the selected Azure subscription for the user to review before continuing with app registration card.

Response asked two questions:
1. Review behaviour
Ans: Do what you recommend (Display resources without blocking app registration)
2. Mock tests only; do not access live Azure or Allow read-only Azure integration test if a test session is available
Ans: Allow read-only Azure integration test if a test session is available

### Prompt 2 (PTR.md and PTD.md attached)
Create a new card after "Choose Azure Subscription" that calls Azure API to list all resources in the selected Azure subscription for the user to review before continuing with app registration card. 

- In the added card, include a button that lets the user continue to app registration while collapsing every other card.
- For the mock test, seed the completion state of previous cards without manually interacting with the UI.
- For the integration test, use the existing repositories defined in testInit.ts instead of mocking the repo.

### Prompt 3 (PTR.md and PTD.md attached)
Create a new card after "Choose Azure Subscription" that calls Azure API to list all resources in the selected Azure subscription for the user to review before continuing with app registration card. 

- In the added card, include a button that lets the user continue to app registration while collapsing every other card.
- For the mock test, seed the completion state of previous cards without manually interacting with the UI (this should be in PTD)
- For the integration test, use the existing repositories defined in testInit.ts instead of mocking the repo (this should be in PTD)
- List the resources in scrollable menu

### Prompt 4 (PTR.md and PTD.md attached)
Create a new card after "Choose Azure Subscription" that calls Azure API to list all resources in the selected Azure subscription for the user to review before continuing with app registration card. 

- Don't have the card depend on Github Login, only depend on Azure login 
- Have a button for refresh 
- Group by resource group if they are contained in a resource group 
- Use the saved authentication files under tell AI that auth is saved under pwtests/corp-src/.auth for integration
- Use existing repo and resources defined in testInit
- Auto-run integration test it generates without modifying 
- optional feature (text-filtering)