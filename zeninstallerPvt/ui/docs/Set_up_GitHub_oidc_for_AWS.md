# How to Set Up GitHub OIDC for AWS

GitHub OIDC lets GitHub Actions authenticate to AWS **without storing any long-lived credentials** — AWS issues a short-lived token at run time by trusting GitHub's identity provider.

## Prerequisites

- An AWS account — see [Creating AWS account](/Creating_AWS_account) if you haven't set one up yet
- Permissions to manage IAM (create identity providers and roles)

## Step 1 of 3 — Add GitHub as an OIDC Identity Provider in AWS IAM

1. Sign in to the [AWS Management Console](https://console.aws.amazon.com/).
2. Search for **IAM** in the top search bar and open it.
3. In the left sidebar, click **Identity providers**.
4. Click **Add provider**.
5. Select **OpenID Connect**.
6. Fill in:

   | Field        | Value                                         |
   | ------------ | --------------------------------------------- |
   | Provider URL | `https://token.actions.githubusercontent.com` |
   | Audience     | `sts.amazonaws.com`                           |

7. Click **Get thumbprint**, then click **Add provider**.

> **Note:** You only need to do this once per AWS account — the same provider is reused for all repositories.

---

## Step 2 of 3 — Create an IAM Role for GitHub Actions

1. In IAM, click **Roles** in the left sidebar.
2. Click **Create role**.
3. Under **Trusted entity type**, select **Web identity**.
4. Fill in:

   | Field                          | Value                                                                                               |
   | ------------------------------ | --------------------------------------------------------------------------------------------------- |
   | Identity provider              | `token.actions.githubusercontent.com`                                                               |
   | Audience                       | `sts.amazonaws.com`                                                                                 |
   | GitHub organisation            | Your GitHub org or username (e.g. `my-org`)                                                         |
   | GitHub repository _(optional)_ | Your repository name (e.g. `ZBCorpArchitecture`), or enter `*` to allow all repositories in the org |
   | GitHub branch _(optional)_     | The branch to restrict access to (e.g. `main`), or enter `*` to allow all branches                  |

5. Click **Next**.
6. Search for and select the following managed policies, then click **Next**:

   | Policy                             | Used for                                                        |
   | ---------------------------------- | --------------------------------------------------------------- |
   | `AWSSSOMasterAccountAdministrator` | IAM Identity Center (SSO) — Entra integration (stages c20, c21) |
   | `AWSOrganizationsFullAccess`       | AWS Organizations access required by IAM Identity Center        |
   | `CloudFrontFullAccess`             | CloudFront distributions (stage c25)                            |
   | `AmazonS3FullAccess`               | S3 origin bucket for CloudFront                                 |
   | `AmazonRoute53FullAccess`          | DNS records for the custom domain                               |
   | `AWSCertificateManagerFullAccess`  | TLS certificates                                                |
   | `IAMFullAccess`                    | Service-linked roles required by CloudFront and SSO             |

7. Enter a **Role name** (e.g. `GitHubActionsRole`).
8. Review the **Trust policy** and **Permissions policies** at the bottom of the page. If you need to customise the trust policy, refer to [Customise the trust policy](#customise-the-trust-policy-optional) below before proceeding.
9. Click **Create role**.

> **After creation:** If you need to make changes, go to the role page and open the **Permissions** tab to modify attached policies, or the **Trust relationships** tab to edit the trust policy.

### Customise the trust policy (optional)

> Replace `<ACCOUNT_ID>`, `<ORG>`, and `<REPO>` with your actual values. Your Account ID is the 12-digit number shown in the top-right corner of the AWS Console next to your account name.

**Allow a specific branch only:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:<ORG>/<REPO>:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

**Allow all branches in a repo:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<ORG>/<REPO>:*"
        }
      }
    }
  ]
}
```

**Allow multiple repositories:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": ["repo:<ORG>/<REPO>:*", "repo:<ORG>/<REPO>:*"]
        }
      }
    }
  ]
}
```

---

## Step 3 of 3 — Enter the Values in ZenInstaller

On the role summary page, find the **ARN** — it looks like:

```
arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>
```

Return to the ZenInstaller page and open the **Environment** step. In the **AWS** section, enter:

| Field          | Where to find it                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `AWS_ROLE_ARN` | The full ARN from the role summary page (e.g. `arn:aws:iam::123456789012:role/GitHubActionsRole`) |

ZenInstaller will save this as a GitHub Actions variable in your repository automatically.
