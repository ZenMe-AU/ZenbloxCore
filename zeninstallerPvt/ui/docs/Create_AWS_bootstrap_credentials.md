# How to Create AWS Credentials for Setup

ZenInstaller needs temporary AWS access keys to create the IAM role on your behalf. You generate them from your existing AWS account and can delete them once setup is complete.

---

## Step 1 — Sign in to the AWS Console

Go to [https://console.aws.amazon.com/](https://console.aws.amazon.com/) and sign in as a user with permission to manage IAM.

---

## Step 2 — Open Security Credentials

1. Search for **IAM** in the top search bar and open it.
2. On the IAM dashboard, find the **Quick Links** section and click **My security credentials**.

---

## Step 3 — Create Access Keys

1. Scroll down to the **Access keys** section and click **Create access key**.
2. Select **Command Line Interface (CLI)** as the use case, tick the confirmation checkbox, and click **Next**.
3. Optionally add a description tag, then click **Create access key**.
4. Copy both values:

   | Field             | What to copy                  |
   | ----------------- | ----------------------------- |
   | Access Key ID     | Starts with `AKIA…`           |
   | Secret Access Key | Shown only once — copy it now |

5. Click **Done**.

---

## Step 4 — Paste into ZenInstaller

Return to ZenInstaller, open the **Let GitHub deploy to AWS** step, and paste the values into the **Access Key ID** and **Secret Access Key** fields.

Click **Create IAM Role**. ZenInstaller will create the role and fill in `AWS_ROLE_ARN` automatically.

---

## Step 5 — Delete the Access Keys (Recommended)

Once the role is created, go back to IAM → Security credentials, find the access key you created, and click **Actions → Deactivate**, then **Delete**.

> The IAM role created for GitHub Actions is not affected.
