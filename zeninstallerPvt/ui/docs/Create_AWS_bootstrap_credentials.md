# How to Create AWS Credentials for Setup

ZenInstaller signs in with the access keys of a dedicated IAM user, `zeninstaller`, and immediately exchanges them for short-term credentials by assuming the `zeninstaller-bootstrap` role. That role can only do what setup needs. All of this stays in your account after setup; see [Clean up](#clean-up-optional) if you want to remove it.

## What gets created

| Resource    | Name                     | What it's for                                                                                                                                                                      |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM user    | `zeninstaller`           | ZenInstaller signs in with this user's access key. On its own, the user can do nothing except assume the bootstrap role.                                                           |
| User policy | `ZenInstallerPolicy`     | Inline policy on the user. Allows only `sts:AssumeRole` on `zeninstaller-bootstrap`.                                                                                               |
| IAM role    | `zeninstaller-bootstrap` | ZenInstaller assumes it to get short-term credentials. Its trust policy lets only the `zeninstaller` user assume it.                                                               |
| Role policy | `ZenInstallerSetup`      | Inline policy on the role, limited to what setup needs: register GitHub as an OIDC identity provider, create or update the GitHub Actions role, and attach `ReadOnlyAccess` to it. |
| Access key  | —                        | Belongs to the user. You paste it into ZenInstaller.                                                                                                                               |

Create them with one CloudFormation template, which creates all of them at once. If you can't use CloudFormation, see [Alternative: IAM console](#alternative-iam-console) to create them by hand.

---

## Create with a CloudFormation template

CloudFormation creates AWS resources from a template file. You upload the ZenInstaller template, and CloudFormation creates everything in the table above as one **stack**. The access key then appears in the stack's **Outputs**. Deleting the stack later removes everything it created.

### Download the template

Download <a href="/scripts/awsUserCloudformation.yaml" download>awsUserCloudformation.yaml</a>. It is a plain YAML file, so you can open it to check exactly what it creates.

### Create the stack

1. Sign in to [https://console.aws.amazon.com/](https://console.aws.amazon.com/) as a user that can create IAM resources and CloudFormation stacks, then open **CloudFormation**.
   - Any region works because IAM is global, but the stack itself lives in the region you pick. Remember it so you can find the stack again to delete it.
2. Click **Create stack → With new resources (standard)**.
3. On **Create stack**:
   1. Under **Prerequisite – Prepare template**, choose **Choose an existing template**.
   2. Under **Specify template**, choose **Upload a template file**, and choose the downloaded `awsUserCloudformation.yaml`.
   3. Click **Next**.
4. On **Specify stack details**:
   1. In **Stack name**, enter `zeninstaller-setup`. This name is only used to find the stack again later, for example if you delete it in [Clean up](#clean-up-optional).
   2. Under **Parameters**, leave **UserName** as `zeninstaller`.
   3. Click **Next**.
5. On **Configure stack options**:
   1. Leave the defaults.
   2. At the bottom, under **Capabilities**, tick the checkbox that starts with **I acknowledge that AWS CloudFormation might create IAM resources**. CloudFormation requires this because the template creates a user and a role with fixed names.
   3. Click **Next**.
6. On **Review and create**, check the details and click **Submit**.

### Wait for the stack to finish

The stack status starts as **CREATE_IN_PROGRESS**, and the **Events** tab lists each resource as it is created. This usually takes a minute or two. Refresh until the status is **CREATE_COMPLETE**.

If the status ends as **ROLLBACK_COMPLETE**, nothing was kept. Open **Events** and find the earliest **CREATE_FAILED** event; its **Status reason** says what went wrong. Later failures usually only say that creation was cancelled. Common causes:

- A user named `zeninstaller` or a role named `zeninstaller-bootstrap` already exists, for example from an earlier attempt. Delete it first.
- The user you signed in with is not allowed to create IAM resources.

Fix the cause, delete the failed stack, and create it again.

### Copy the access key

Open the **Outputs** tab and copy both values:

| Key               | Field in ZenInstaller |
| ----------------- | --------------------- |
| `AccessKeyId`     | Access Key ID         |
| `SecretAccessKey` | Secret Access Key     |

> Anyone who can view CloudFormation stacks in this account can read this secret in **Outputs** for as long as the stack exists.

Continue at [Paste into ZenInstaller](#paste-into-zeninstaller).

---

## Alternative: IAM console

Replace `<ACCOUNT_ID>` below with your 12-digit AWS account ID (shown in the top-right account menu of the console).

### Create the IAM user

1. Sign in to [https://console.aws.amazon.com/](https://console.aws.amazon.com/) as a user with permission to manage IAM, then open **IAM**.
2. Go to **Users → Create user**.
3. User name: `zeninstaller`. Leave **Provide user access to the AWS Management Console** unticked.
4. On the permissions page choose nothing, click **Next**, then **Create user**.
5. Open the new user → **Permissions** → **Add permissions → Create inline policy** → **JSON**, paste the following, and name it `ZenInstallerPolicy`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "sts:AssumeRole", "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/zeninstaller-bootstrap" }
     ]
   }
   ```

### Create the bootstrap role

Create the user first: the role's trust policy refers to it, and IAM rejects a principal that doesn't exist yet.

1. Go to **Roles → Create role** and choose **Custom trust policy**. Paste:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Principal": { "AWS": "arn:aws:iam::<ACCOUNT_ID>:user/zeninstaller" }, "Action": "sts:AssumeRole" }
     ]
   }
   ```

2. On the permissions page choose nothing, click **Next**.
3. Role name: `zeninstaller-bootstrap` (ZenInstaller looks for this exact name). Click **Create role**.
4. Open the role → **Permissions** → **Add permissions → Create inline policy** → **JSON**, paste the following, and name it `ZenInstallerSetup`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "iam:CreateOpenIDConnectProvider",
         "Resource": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
       },
       {
         "Effect": "Allow",
         "Action": ["iam:CreateRole", "iam:GetRole", "iam:UpdateAssumeRolePolicy"],
         "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/*"
       },
       {
         "Effect": "Allow",
         "Action": "iam:AttachRolePolicy",
         "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/*",
         "Condition": { "ArnEquals": { "iam:PolicyARN": "arn:aws:iam::aws:policy/ReadOnlyAccess" } }
       }
     ]
   }
   ```

### Create access keys

1. Open **Users → zeninstaller → Security credentials**.
2. In **Access keys**, click **Create access key**, choose **Application running outside AWS**, and click **Next**.
3. Optionally add a description tag, then click **Create access key**.
4. Copy both values:

   | Field             | What to copy                  |
   | ----------------- | ----------------------------- |
   | Access Key ID     | Starts with `AKIA…`           |
   | Secret Access Key | Shown only once — copy it now |

5. Click **Done**.

---

## Paste into ZenInstaller

Return to ZenInstaller, paste the values into the **Access Key ID** and **Secret Access Key** fields of the **AWS login** step, and click **Sign in**.

Then click **Create IAM Role** in the **AWS setup** step. ZenInstaller will create the role and fill in `AWS_ROLE_ARN` automatically.

> On the AWS Free plan, AWS blocks creating identity providers, so **Create IAM Role** fails at the identity provider step. Upgrade to a paid plan first.

---

## Clean up (optional)

The user, its access key and the bootstrap role stay in your account after setup. If you no longer need them, delete them:

- **CloudFormation:** in **CloudFormation**, in the region where you created it, select the `zeninstaller-setup` stack and click **Delete**. This removes the user, its access key and the bootstrap role.
- **IAM console:**
  1. **Users → zeninstaller → Security credentials**: **Actions → Deactivate**, then **Delete** the access key. Deleting the `zeninstaller` user removes it too.
  2. **Roles → zeninstaller-bootstrap → Delete**.

> The IAM role and identity provider created for GitHub Actions are not affected.
