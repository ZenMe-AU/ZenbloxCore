# Corporate Environment Deployment Automation

Each stage folder's `run.js` automates the setup and management of a corporate Azure environment using Terraform and Azure CLI. It supports multi-stage deployment, resource import, and environment variable management for repeatable, auditable infrastructure provisioning.

## Prerequisites

- Node.js 20+
- Terraform CLI
- Azure CLI (logged in with sufficient permissions)
- The `corp.env` file in the same directory, containing at least the `NAME` key (corporate name)
- All referenced Terraform directories (e.g., `SubscriptionBudget`, `GlobalGroups`, `RootRg`) must exist and contain valid Terraform code

## How to Run

1. **Install dependencies**

   ```sh
   pnpm install
   ```

2. **Prepare your environment:**
   - Ensure `corp.env` is present and contains required keys (e.g., `NAME`, `DNS`, `SUBSCRIPTION_ID` as needed).
   - Log in to Azure CLI: `az login`

3. **Run a stage** from `corpSetup`, by running that stage folder's `run.js`:

   ```sh
   node SubscriptionBudget/run.js
   ```

4. **Auto-approve Terraform apply (optional):**
   ```sh
   node SubscriptionBudget/run.js --auto-approve
   ```

5. **Plan without applying:**
   ```sh
   node SubscriptionBudget/run.js --planOnly
   ```

## Stages Overview

- ### SubscriptionBudget
  - **Purpose:**
    - Creates or imports an Azure subscription for the corporate environment.
    - Sets a monthly budget and notification emails.
  - **Required `corp.env` parameters:**
    - NAME
  - **Required variables in `variables.tf` (must be set before running this stage):**
    - billing_account_name
    - billing_profile_name
    - invoice_section_name
    - contact_emails
  - **Actions:**
    - Sets Terraform variables for subscription name, ID, and contact emails.
    - Initializes Terraform and imports existing subscription/budget if found.
    - Applies Terraform to create or update the subscription and budget.
    - Updates `corp.env` with the new subscription ID if created.

- ### GlobalGroups
  - **Purpose:**
    - Manages Azure AD groups for deployment roles (e.g., ResourceGroupDeployer, LeadDeveloper, DbAdmin-Dev/Test/Prod).
  - **Required `corp.env` parameters:**
    - NAME
    - SUBSCRIPTION_ID
  - **Actions:**
    - Imports existing groups and role assignments if present.
    - Ensures group memberships and role assignments are tracked in Terraform state.

- ### RootRg
  - **Purpose:**
    - Sets up the root resource group, DNS zone, Log Analytics workspace, and diagnostic settings.
  - **Required `corp.env` parameters:**
    - NAME
    - SUBSCRIPTION_ID
    - DNS
  - **Actions:**
    - Imports existing resources if present (resource group, log analytics, DNS zone, diagnostics).
    - Applies Terraform to create or update these resources.

- ### CloudFront
  - **Purpose:**
    - Deploys and manages the corporate frontend website (login page), Lambda@Edge (authentication), CloudFront CDN, and related Azure/AWS integration resources.
  - **Required `corp.env` parameters:**
    - NAME
    - SUBSCRIPTION_ID
    - DNS
  - **Prerequisites:**
    1. You must have both AWS and Azure accounts.
    2. Storage Account exists (requires `RootRg` to be completed first).
  - **Actions:**
    - Initializes Terraform backend using the root resource group and storage account.
    - Installs dependencies and builds the SPA frontend and Lambda@Edge function.
    - Runs Terraform apply to deploy all resources.
  - **Notes:**
    - If the Storage Account is not created, run the RootRg stage first.
    - For AWS-related resources, ensure Terraform/Azure CLI/AWS CLI permissions and credentials are properly configured.

## Environment Variable Management

- The script loads and updates `corp.env` for environment state.
- Adds or updates keys such as `SUBSCRIPTION_ID` as resources are created.

## Error Handling

- The script will exit with an error message if required environment variables or files are missing, or if any command fails.

## Notes

- Each stage is a subdirectory (e.g., `SubscriptionBudget`) holding its Terraform code and the `run.js` that imports existing resources, then plans or applies there.
- The script is idempotent: it will import existing resources into Terraform state if they already exist in Azure.
- You can customize contact emails and other variables by editing `corp.env` or passing them as Terraform variables.

---

For more details, review each stage's `run.js` and the Terraform files in each stage directory.
