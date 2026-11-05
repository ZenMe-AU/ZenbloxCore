# How to Create a Free Azure Account

This guide walks through the steps required to create a Microsoft Entra ID tenant (the directory that holds your organization's users, groups, and apps) while signing up for an Azure free trial.

## Start the Azure Free Trial

1. Navigate to the Azure signup page: [https://azure.microsoft.com/en-gb/free/entra-id](https://azure.microsoft.com/en-gb/free/entra-id)

2. If you do not have a personal email account, create one at [https://www.microsoft.com/en-us/microsoft-365/outlook](https://www.microsoft.com/en-us/microsoft-365/outlook)

3. Select **Pay as you go**.

   ![Azure signup page](images/azure-account/image1.png)

4. You will be prompted to sign in with an existing Microsoft account or create a new one.

5. After signing in, the system begins a three-step registration process.

## Step 1 of 3 — Organisation & Contact Information

This step establishes who is creating the tenant and which organisation it belongs to.

![Sign in prompt](images/azure-account/image2.png)

**Fields to Complete**

| **Field**                                     | **What to Enter**                                        | **Notes**                                               |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| **Personal use or for organisation**          | Choose "for use in connection with an organisation…"     | Cannot be changed later                                 |
| **Country/Region**                            | Select the country that matches your **billing address** | Cannot be changed later                                 |
| **First name**                                | Your legal first name                                    | Used for identity verification                          |
| **Last name**                                 | Your legal last name                                     | Used for identity verification                          |
| **Organisation name**                         | Name of your organisation                                | This becomes part of your Azure billing profile         |
| **Organisation country**                      | Country where the organisation is registered             | Often autofilled based on earlier selection             |
| **Email address for important notifications** | Your work email                                          | Azure sends billing, security, and service alerts here  |
| **Phone**                                     | A valid mobile or landline number                        | Used for identity verification                          |
| **ABN (optional)**                            | Leave this section empty                                 | Optional but recommended for organisations in Australia |

## Step 2 of 3 — Address & Agreements

This step collects your physical address and requires you to accept Microsoft's terms.

![Address and agreements form](images/azure-account/image3.png)

**Fields to Complete**

| **Field**          | **What to Enter**             | **Notes**                                   |
| ------------------ | ----------------------------- | ------------------------------------------- |
| **Address line 1** | Primary business address      | Required                                    |
| **Address line 2** | Suite, unit, or building info | Optional                                    |
| **City**           | City or suburb                | Required                                    |
| **State**          | Select from the dropdown      | Required                                    |
| **Postal Code**    | Valid postal code             | Required; form will not continue without it |

**Required Agreements**

You must check the box confirming:

- You are the individual identified on the account, and you agree to the **Microsoft Customer Agreement** and **Supplemental Individual User Terms**

**Optional Communication Preferences**

You may choose to opt in to:

- Product updates, tips, and offers from Microsoft
- Information from Microsoft partners

These do not affect your ability to proceed.

## Step 3 of 3 — Payment Verification

Azure may require a valid payment method to verify your identity and billing account. Signup offers and eligibility vary by region and account. If you select a pay-as-you-go subscription, paid usage can incur charges; review current pricing and terms before deploying resources.

![Payment verification form](images/azure-account/image4.png)

**Fields to Complete**

| **Field**           | **What to Enter**                           | **Notes** |
| ------------------- | ------------------------------------------- | --------- |
| **Cardholder Name** | Name exactly as it appears on the card      | Required  |
| **Card Number**     | Valid Visa, Mastercard, or American Express | Required  |
| **Expiry (MM/YY)**  | Select month and year                       | Required  |
| **CVV**             | 3 or 4-digit security code                  | Required  |
| **Address line 1**  | Billing address for the card                | Required  |
| **Address line 2**  | Optional                                    |           |
| **City**            | City or suburb                              | Required  |
| **State**           | Select from the dropdown                    | Required  |
| **Postal Code**     | Valid postal code                           | Required  |

Once submitted, Microsoft will validate your card and complete the tenant creation.

## Completion

After all three steps are successfully submitted:

- Your **Azure subscription** (the billing and resource-management boundary for Azure services) is created
- Your **Microsoft Entra ID tenant** is provisioned
- You can immediately begin configuring users, groups, applications, and security settings

## Permissions for installer resource groups

When you select a subscription in **Choose Azure subscription**, the installer automatically checks your subscription-level Azure permissions for
resource provisioning (storage, monitoring, DNS, Functions and Web PubSub), provider registration, budgets, role assignments, and deletion locks.
Missing permissions or a failed verification produce a warning, including the missing actions and guidance to obtain **Owner**, or **Contributor +
User Access Administrator** (or equivalent permissions), at subscription scope. Use **Recheck subscription access** after granting or activating access.
The warning is advisory: you can still select and save the subscription.

Passing this check is not a guarantee of completing every installer stage. Entra directory roles/admin consent, storage data permissions,
tenant-root management-group access, AWS/GitHub access, Azure policies, deny assignments, and role-assignment conditions are not verified here.

The Core domain, Terraform state backend, Frontend hosting environment, and Private Zeninstaller Backend Environment cards check your signed-in account's
effective permissions as soon as your Azure account and subscription are selected, before you click the resource creation button. The button stays
disabled while access is being checked or is missing. Access feedback appears above **Resources to be created**, with an outlined warning and a
**Recheck subscription access** button. Use it after activating a role or receiving access; changing the
account, tenant, or subscription automatically starts a new check. Access is checked again when setup starts.
You need **Contributor** access on that subscription, or equivalent
resource-group creation permissions such as **Owner**. Access scoped only to an existing resource group is not sufficient.

If the check fails, ask a subscription administrator to grant access under **Subscription > Access control (IAM)**, or activate an eligible role in
**Privileged Identity Management (PIM)**, then retry the card. If access cannot be verified, the card stops and shows the verification error.

This check covers resource-group creation only. Role assignments, resource locks, Entra domain/app management, and admin consent still require their
own additional permissions.
