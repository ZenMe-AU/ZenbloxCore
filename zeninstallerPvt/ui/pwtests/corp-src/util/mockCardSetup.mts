/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import { CORP_URL, GITHUB_API_URL, AZURE_MANAGEMENT_URL } from "../../testInit";
import { installMockAzure, installMockGitHub, installRelayNetworkGuard } from "./mockTestHelper.mts";
import { expandCard } from "./cardHelper.mts";

export const tenantId = "00000000-0000-0000-0000-000000000001";
export const subscriptionId = "mock-subscription";
export const siteStorage = "pwtestsfrontend";
export const siteUrl = `https://${siteStorage}.z8.web.core.windows.net`;
export const privateGroup = `/subscriptions/${subscriptionId}/resourceGroups/zeninstaller-private-rg`;
export const storageId = `${privateGroup}/providers/Microsoft.Storage/storageAccounts/${siteStorage}`;
export const mockNow = new Date("2026-10-05T02:00:00Z");
export const awsRoleArn = "arn:aws:iam::123456789012:role/zeninstaller-github";
export const awsSession = {
  identity: { accountId: "123456789012", arn: "arn:aws:iam::123456789012:user/mock-aws-user", username: "mock-aws-user" },
  mfaDevices: [],
  credentials: {
    accessKeyId: "ASIA_MOCK_SESSION",
    secretAccessKey: "mock-session-secret",
    sessionToken: "mock-session-token",
    expiration: "2026-10-05T05:00:00.000Z",
  },
};

export async function prepareCardMocks(
  page: Page,
  context: BrowserContext,
  variables: Record<string, string> = {},
  options: { aws?: boolean; frontend?: boolean } = {}
) {
  await page.clock.install({ time: mockNow });
  const unexpectedRequests = await installRelayNetworkGuard(context);
  const repoName = "pwtests-cards";
  const github = await installMockGitHub(page, context, {
    repositoryName: repoName,
    branches: ["main", "PROD"],
    initialVariables: {
      NAME: "pwtests",
      DNS: "pwtests.example.com",
      CONTACT_EMAILS: "owner@example.com",
      AZURE_TENANT_ID: tenantId,
      VITE_AZURE_TENANT_ID: tenantId,
      AZURE_SUBSCRIPTION_ID: subscriptionId,
      AZURE_CLIENT_ID: "00000000-0000-0000-0000-000000000002",
      AZURE_PLAN_CLIENT_ID: "00000000-0000-0000-0000-000000000002",
      AWS_ROLE_ARN: awsRoleArn,
      SITE_STORAGE_ACCOUNT: siteStorage,
      ...(options.frontend ? { VITE_AZURE_CLIENT_ID: "mock-installer-client", VITE_GITHUB_CLIENT_ID: "mock-oauth-client" } : {}),
      ...variables,
    },
  });
  await installMockAzure(page, { appDisplayName: "zeninstaller-pwtests", servicePrincipalCreated: true, rbacAssigned: true });
  await context.addInitScript(
    ({ tenant, session }) => {
      sessionStorage.setItem("zeninstaller_arm_tenant", tenant);
      if (session) sessionStorage.setItem("zeninstaller_aws_session", JSON.stringify(session));
    },
    { tenant: tenantId, session: options.aws ? awsSession : null }
  );
  // Follow the subscription mock's module-level auth seam; all service APIs still run through fetch.
  await page.route(/\/corp-src\/auth\/msal\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
      export const PINNED_TENANT_ID = "${tenantId}";
      export const LOGIN_AUTHORITY = "https://login.microsoftonline.com/${tenantId}";
      export const cleanTenantId = tenant => tenant?.trim().toLowerCase();
      const account = { homeAccountId: "mock-home", environment: "login.microsoftonline.com",
        tenantId: "${tenantId}", localAccountId: "mock-user", username: "mock-user@example.com",
        name: "Mock Azure User", tenantProfiles: new Map() };
      const reject = async () => { throw new Error("Unexpected authentication redirect in card mock"); };
      export const getMsal = async () => ({ handleRedirectPromise: async () => null,
        getAllAccounts: () => [account], acquireTokenSilent: async () => ({ account, accessToken: "mock-token" }),
        loginRedirect: reject, acquireTokenRedirect: reject, clearCache: async () => {} });
      export const ensureScopeConsent = async () => false;
      export const getToken = async () => "mock-token";
      let active;
      export const setActiveAzureIdentity = value => { active = value; };
      export const getMsToken = async () => active ? "mock-token" : null;
      export const requireMsToken = async () => {
        if (!active) throw new Error("No mocked Azure account selected");
        return "mock-token";
      };
    `,
    })
  );
  await page.route(`${GITHUB_API_URL}/**/deployments?*`, (route) => replyJson(route, []));
  await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.toLowerCase();
    if (route.request().method() !== "GET") return route.fallback();
    if (path.endsWith("/locations"))
      return replyJson(route, {
        value: [{ name: "australiaeast", displayName: "Australia East", metadata: { regionType: "Physical" } }],
      });
    if (path.endsWith("/providers/microsoft.storage/storageaccounts")) {
      return replyJson(route, { value: options.frontend ? [storageResource()] : [] });
    }
    if (path === privateGroup.toLowerCase()) {
      return replyJson(route, options.frontend ? { id: privateGroup, location: "australiaeast" } : {}, options.frontend ? 200 : 404);
    }
    return route.fallback();
  });
  const url = new URL(CORP_URL);
  url.search = new URLSearchParams({
    account: "mock-user",
    repo: repoName,
    env: "PROD",
    tenant: tenantId,
    subscription: subscriptionId,
  }).toString();
  return {
    github,
    repoName,
    unexpectedRequests,
    open: async (id: string) => {
      await page.goto(url.toString());
      const card = page.locator(`#card-${id}`);
      await expandCard(card);
      return card;
    },
  };
}

export function storageResource() {
  return { id: storageId, name: siteStorage, properties: { provisioningState: "Succeeded", primaryEndpoints: { web: `${siteUrl}/` } } };
}

export async function replyJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, json: body });
}

export async function installAwsApi(page: Page, options: { mfa?: boolean; denied?: string } = {}) {
  const calls: URLSearchParams[] = [];
  await page.route(/^https:\/\/(?:sts(?:\.us-east-1)?|iam)\.amazonaws\.com\/(?:\?.*)?$/, async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    const body = new URLSearchParams(request.postData() ?? "");
    calls.push(body);
    const action = body.get("Action");
    if (action === options.denied) {
      return route.fulfill({
        status: 403,
        contentType: "text/xml",
        body: "<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>Mock AWS permission denied</Message></Error><RequestId>mock-request</RequestId></ErrorResponse>",
      });
    }
    let result: string;
    switch (action) {
      case "GetCallerIdentity":
        result = `<Account>${awsSession.identity.accountId}</Account><Arn>${awsSession.identity.arn}</Arn><UserId>mock-user</UserId>`;
        break;
      case "ListMFADevices":
        result = `<MFADevices>${options.mfa ? "<member><UserName>mock-aws-user</UserName><SerialNumber>arn:aws:iam::123456789012:mfa/mock-device</SerialNumber><EnableDate>2026-01-01T00:00:00Z</EnableDate></member>" : ""}</MFADevices>`;
        break;
      case "GetSessionToken":
        result = `<Credentials><AccessKeyId>${awsSession.credentials.accessKeyId}</AccessKeyId><SecretAccessKey>${awsSession.credentials.secretAccessKey}</SecretAccessKey><SessionToken>${awsSession.credentials.sessionToken}</SessionToken><Expiration>${awsSession.credentials.expiration}</Expiration></Credentials>`;
        break;
      case "CreateOpenIDConnectProvider":
        result = "<OpenIDConnectProviderArn>arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com</OpenIDConnectProviderArn>";
        break;
      case "CreateRole":
        result = `<Role><Arn>${awsRoleArn}</Arn><RoleName>zeninstaller-github</RoleName><RoleId>mock-role</RoleId><Path>/</Path><CreateDate>2026-10-05T02:00:00Z</CreateDate></Role>`;
        break;
      case "AttachRolePolicy":
        result = "";
        break;
      default:
        throw new Error(`Unexpected AWS action: ${action}`);
    }
    await route.fulfill({
      contentType: "text/xml",
      body: `<${action}Response xmlns="https://${request.url().includes("iam.") ? "iam.amazonaws.com/doc/2010-05-08" : "sts.amazonaws.com/doc/2011-06-15"}/"><${action}Result>${result}</${action}Result><ResponseMetadata><RequestId>mock-request</RequestId></ResponseMetadata></${action}Response>`,
    });
  });
  return calls;
}
