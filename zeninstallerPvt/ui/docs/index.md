# ZenInstaller Documentation

ZenInstaller guides users through configuring an organisation's cloud environment, connecting a GitHub repository and environment to Azure and Microsoft Entra, with AWS setup where needed. It breaks setup into a dependency-aware checklist so teams can complete and track tasks in manageable steps. For infrastructure stages, GitHub Actions creates a Terraform plan for review; users then choose when to deploy it through the app's remote terminal.

To use ZenInstaller, you first need to manually create a few accounts to enable the deployment system.

Before you begin, make sure you have access to a GitHub account and organization, plus the cloud account or subscription you plan to configure. Some deployment stages also require a domain name.

You will need:

1. A personal email address, using Google, Apple or any other email hosting provider.
2. ZenInstaller is used to create an organisation configuration on a number of cloud hosting providers, for this reason you will need an organisation name and domain name. We recommend that you register the domain name with Godaddy https://www.godaddy.com/

3. A Github account, this is where your configuration and customisations will be recorded.
   Open https://github.com/
   Sign-Up and create an organisation with your organisation name and personal email address.

4. Add ZenInstaller app to your new Github Organisation account.

If you do not have a GitHub account yet, use the **GitHub Sign Up** card to open GitHub's signup page in a new tab with your email prefilled. Finish creating the account on GitHub, then return to ZenInstaller to sign in. Your email is sent directly to GitHub only when you continue.

Need help?

- [Configure GitHub sign-in for a ZenInstaller deployment](Allow_access_to_GitHub) — for operators deploying or hosting ZenInstaller; the hosted service's users do not need to register a separate OAuth app.

- [Create an Azure account and subscription](Creating_AZURE_account), then use ZenInstaller's Azure setup cards. The [Azure OIDC guide](Set_up_GitHub_oidc_for_AZURE) covers manually managed deployment identities.

- [Create an AWS account](Creating_AWS_account), then [create AWS bootstrap credentials](Create_AWS_bootstrap_credentials). ZenInstaller's AWS setup card creates the OIDC role; the [AWS OIDC guide](Set_up_GitHub_oidc_for_AWS) also documents manual IAM setup.

When you're ready, [open ZenInstaller and start setup](/core/).
