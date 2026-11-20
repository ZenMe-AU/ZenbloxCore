# How to Create AWS Credentials for Setup

ZenInstaller needs AWS credentials to create the GitHub OIDC provider and IAM (Identity and Access Management) role. The access keys you create below are long-lived IAM user credentials, not temporary keys. ZenInstaller exchanges them for 15-minute STS (AWS Security Token Service) session credentials while you are signed in. Deactivate or delete the long-lived access key after the role is set up.

Do not create or use access keys for the AWS root user (the account's highest-privilege identity). Use an IAM user that is permitted to manage IAM identity providers and roles, and attach the `AdministratorAccess` policy required by the role ZenInstaller creates. These permissions are broad; use a dedicated AWS account where possible.

---

## Step 1 — Sign in to the AWS Console

Go to [https://console.aws.amazon.com/](https://console.aws.amazon.com/) and sign in as a user with permission to manage IAM.

---

## Step 2 — Open the IAM User's Security Credentials

1. Search for **IAM** in the top search bar and open it.
2. In the left navigation, click **Users** and select the IAM user you will use for setup.
3. Open the **Security credentials** tab.

---

## Step 3 — Create Access Keys

1. In the **Access keys** section, click **Create access key**.
2. Select **Command Line Interface (CLI)** (the label for programmatic access) as the use case, tick the confirmation checkbox, and click **Next**.
3. Optionally add a description tag, then click **Create access key**.
4. Copy both values. The secret access key is shown only once:

   | Field             | What to copy                  |
   | ----------------- | ----------------------------- |
   | Access Key ID     | Starts with `AKIA…`           |
   | Secret Access Key | Shown only once — copy it now |

5. Click **Done**.

---

## Step 4 — Paste into ZenInstaller

Return to ZenInstaller and open the **AWS login** step. Paste the values into the **Access Key ID** and **Secret Access Key** fields, then complete the AWS setup card to create the OIDC role.

ZenInstaller will create the role and save its ARN (Amazon Resource Name, the role's unique AWS identifier) as `AWS_ROLE_ARN` in the selected GitHub repository environment.

---

## Step 5 — Delete the Access Keys (Recommended)

Once setup is complete, go back to the IAM user's **Security credentials** tab, find the access key you created, and deactivate and delete it. Do not delete the OIDC role; GitHub Actions uses that role to deploy.

> The IAM role created for GitHub Actions is not affected.
