/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test";
import {
  AZURE_MANAGEMENT_SCOPE,
  AZURE_MANAGEMENT_URL,
  CORP_URL,
  GITHUB_API_URL,
  GRAPH_APPLICATION_SCOPE,
  GRAPH_APP_ROLE_ASSIGNMENT_SCOPE,
  MICROSOFT_GRAPH_URL,
  MICROSOFT_LOGIN_URL,
  MOCK_BACKEND_URL,
} from "../../testInit";
import { expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard } from "./cardHelper.mts";
import { chooseExistingRepo, createNewRepo } from "./testHelper.mts";

const mockUser = { login: "mock-user", id: 12345 };
const mockTenantId = "00000000-0000-0000-0000-000000000001";
const mockSecondTenantId = "00000000-0000-0000-0000-000000000005";
export const mockMsaTenantId = "9188040d-6c67-4c5b-b112-36a304b66dad";
const mockSubscriptionId = "mock-subscription";
const mockSecondSubscriptionId = "mock-subscription-second";
const mockAppId = "00000000-0000-0000-0000-000000000002";
const mockAppObjectId = "00000000-0000-0000-0000-000000000003";
export const mockServicePrincipalId = "00000000-0000-0000-0000-000000000004";
const mockSpObjectId = mockServicePrincipalId;
export const mockReaderRoleId = "acdd72a7-3385-48ef-bd42-f606fba81ae7";

export type MockAzureTenant = { tenantId: string; displayName: string };
export type MockAzureSubscription = { subscriptionId: string; displayName: string; tenantId: string; state: string };
export type MockAzureRoleAssignmentWrite = { url: string; scope: string; roleDefinitionId: string; principalId: string; principalType?: string };
export type MockAzureFederatedCredentialWrite = { url: string; name: string; issuer: string; subject: string; audiences: string[] };

type MockGitHubOptions = {
	initialVariables?: Record<string, string>;
	repositoryName?: string;
	branches?: string[];
};

export type MockGitHubState = {
  variables: Record<string, string>;
  repositoryName: string | null;
  branches: Set<string>;
  oidcSubjectUpdates: Array<{ url: string; use_default: boolean; include_claim_keys: string[]; use_immutable_subject: boolean }>;
};

export type MockAzureState = {
  appDisplayName: string | null;
  servicePrincipalCreated: boolean;
  federatedSubjects: Set<string>;
  rbacAssigned: boolean;
  tenants: MockAzureTenant[];
  subscriptions: MockAzureSubscription[];
  subscriptionResponseStatus: number;
  roleAssignmentWrites: MockAzureRoleAssignmentWrite[];
  federatedCredentialWrites: MockAzureFederatedCredentialWrite[];
  applicationCreationFailuresRemaining: number;
  applicationLookupFailureStatus: number | null;
};

export type CreateDomainAzureMockState = {
	domainExists: boolean;
	domainVerified: boolean;
	domainPrimary: boolean;
	dnsZoneExists: boolean;
	dnsTxtExists: boolean;
	adminConsentGranted: boolean;
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export function coreInfraStepLabels(companyShortCode: string) {
  return [
    "Confirm Microsoft permissions",
    "Register required Azure resource providers",
    `Create resource group root-${companyShortCode}`,
    "Grant GitHub Actions access to the resource group",
    `Create Log Analytics workspace ${companyShortCode}-law`,
    "Configure subscription activity-log diagnostics",
    `Create Application Insights ${companyShortCode}-appinsights`,
    `Create storage account ${companyShortCode}pvt`,
    "Create terraformstate container",
    "Grant GitHub Actions access to Terraform state",
  ];
}

export async function expectSuccessfulSteps(card: Locator, labels: string[]) {
  for (const label of labels) {
    const row = card.getByText(label, { exact: true }).locator("../..");
    await expect(row.locator('svg[data-testid="CheckCircleOutlineIcon"], svg[data-testid="RemoveCircleOutlineIcon"]')).toHaveCount(1);
    await expect(row.locator('svg[data-testid="ErrorOutlineIcon"]')).toHaveCount(0);
    await expect(row.getByRole("progressbar")).toHaveCount(0);
  }
}

export type CoreInfraAzureMockState = {
  createdResources: Set<string>;
  roleAssignments: Map<string, Set<string>>;
};

export async function installCoreInfraAzureMock(page: Page): Promise<CoreInfraAzureMockState> {
  const state: CoreInfraAzureMockState = {
    createdResources: new Set(),
    roleAssignments: new Map(),
  };

  const resourceKey = (path: string) => {
    if (/^\/subscriptions\/[^/]+\/resourcegroups\/root-pwtests$/i.test(path)) return "resource-group";
    if (/\/workspaces\/pwtests-law$/i.test(path)) return "log-analytics";
    if (/\/diagnosticsettings\/standard-diagnostics-setting$/i.test(path)) return "diagnostics";
    if (/\/components\/pwtests-appinsights$/i.test(path)) return "app-insights";
    if (/\/storageaccounts\/pwtestspvt$/i.test(path)) return "storage-account";
    if (/\/containers\/terraformstate$/i.test(path)) return "storage-container";
    return null;
  };

  await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const normalizedPath = path.toLowerCase();
    const method = request.method();

    if (normalizedPath.endsWith("/locations") && method === "GET") {
      return json(route, {
        value: [{ name: "australiaeast", displayName: "Australia East", metadata: { regionType: "Physical" } }],
      });
    }

    if (/^\/subscriptions\/[^/]+\/providers\/microsoft\.[^/]+$/i.test(path)) {
      return json(route, { registrationState: "Registered" });
    }

    if (normalizedPath.endsWith("/checknameavailability") && method === "POST") {
      return json(route, { nameAvailable: true });
    }

		const roleAssignmentsMarker = "/providers/microsoft.authorization/roleassignments";
		const roleAssignmentsIndex = normalizedPath.indexOf(roleAssignmentsMarker);
		if (roleAssignmentsIndex >= 0) {
			const scope = normalizedPath.slice(0, roleAssignmentsIndex);
			const isCoreInfraScope =
				/\/resourcegroups\/root-pwtests$/i.test(scope) || /\/storageaccounts\/pwtestspvt$/i.test(scope);
			if (!isCoreInfraScope) return route.fallback();

			if (method === "GET") {
				const roleIds = state.roleAssignments.get(scope) ?? new Set<string>();
				return json(route, {
					value: [...roleIds].map((roleId) => ({
						properties: { roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${roleId}` },
					})),
				});
			}
			if (method === "PUT") {
				const body = request.postDataJSON() as { properties?: { roleDefinitionId?: string } };
				const roleId = body.properties?.roleDefinitionId?.split("/").pop()?.toLowerCase();
				if (roleId) {
					const roleIds = state.roleAssignments.get(scope) ?? new Set<string>();
					roleIds.add(roleId);
					state.roleAssignments.set(scope, roleIds);
				}
				return json(route, {});
			}
		}

    const key = resourceKey(normalizedPath);
    if (key) {
      if (method === "GET") {
        if (!state.createdResources.has(key)) {
          return json(route, { error: { code: "ResourceNotFound" } }, 404);
        }
        return json(route, { id: path, properties: { provisioningState: "Succeeded" } });
      }
      if (method === "PUT") {
        state.createdResources.add(key);
        return json(route, { id: path, properties: { provisioningState: "Succeeded" } });
      }
    }

    return route.fallback();
  });

  return state;
}

export async function installMockGitHub(page: Page, context: BrowserContext, options: MockGitHubOptions = {}): Promise<MockGitHubState> {
  await context.addInitScript(() => {
    sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "direct", token: "ghp_mock" }));
  });

	const state: MockGitHubState = {
		variables: { ...options.initialVariables },
		repositoryName: options.repositoryName ?? null,
		branches: new Set(options.branches ?? ["main"]),
		oidcSubjectUpdates: [],
	};

  await page.route(`${GITHUB_API_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (["HEAD", "OPTIONS"].includes(request.method())) {
      await route.continue();
      return;
    }

    if (path === "/user" && request.method() === "GET") return json(route, mockUser);
    if (path === "/user/orgs" && request.method() === "GET") return json(route, []);
    if (/^\/(?:user\/repos|orgs\/[^/]+\/repos)$/.test(path) && request.method() === "GET") {
      const repositories = [{ id: 111111, name: "existing-unrelated-repo", owner: { type: "User" } }];
      if (state.repositoryName) {
        repositories.push({
          id: 987654321,
          name: state.repositoryName,
          owner: { type: "User" },
        });
      }
      return json(route, repositories);
    }
    if (path === "/repos/ZenMe-AU/ZenbloxCore/generate" && request.method() === "POST") {
      const body = request.postDataJSON() as { name: string };
      state.repositoryName = body.name;
      return json(route, { id: 987654321, name: body.name }, 201);
    }
    const variableMatch = path.match(/^\/repos\/[^/]+\/[^/]+\/environments\/[^/]+\/variables(?:\/([^/]+))?$/);
    if (variableMatch) {
      const variableName = variableMatch[1];
      if (request.method() === "GET") {
        return json(route, {
          total_count: Object.keys(state.variables).length,
          variables: Object.entries(state.variables).map(([name, value]) => ({ name, value })),
        });
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { name: string; value: string };
        state.variables[body.name] = body.value;
        return json(route, {}, 201);
      }
      if (request.method() === "PATCH" && variableName) {
        const body = request.postDataJSON() as { value: string };
        state.variables[variableName] = body.value;
        return json(route, {});
      }
      if (request.method() === "DELETE" && variableName) {
        delete state.variables[variableName];
        return route.fulfill({ status: 204 });
      }
    }
    if (path.includes("/environments") && request.method() === "GET") {
      return json(route, {
        total_count: 2,
        environments: [
          { name: "PROD", id: 1001 },
          { name: "TEST", id: 1002 },
        ],
      });
    }
    if (/\/environments\/(?:PROD|TEST)$/.test(path) && request.method() === "PUT") return json(route, {});
    if (path.endsWith("/branches") && request.method() === "GET") {
      return json(
        route,
        Array.from(state.branches, (name) => ({
          name,
          commit: { sha: `${name.toLowerCase()}-mock-sha` },
          protected: name === "main",
        }))
      );
    }
    if (/\/git\/ref\/heads\/[^/]+$/.test(path) && request.method() === "GET") {
      const branch = path.split("/").pop() ?? "main";
      return json(route, { object: { sha: `${branch.toLowerCase()}-mock-sha` } });
    }
    if (path.endsWith("/git/refs") && request.method() === "POST") {
      const body = request.postDataJSON() as { ref: string };
      state.branches.add(body.ref.replace("refs/heads/", ""));
      return json(route, {}, 201);
    }
    if (path.endsWith("/actions/oidc/customization/sub") && request.method() === "PUT") {
      const body = request.postDataJSON() as {
        use_default: boolean;
        include_claim_keys: string[];
        use_immutable_subject: boolean;
      };
      state.oidcSubjectUpdates.push({ url: request.url(), ...body });
      return json(route, {});
    }
    if (request.method() === "GET" && path.startsWith("/repos/")) {
      return json(route, {
        id: 987654321,
        name: state.repositoryName ?? path.split("/")[3],
        template_repository: { full_name: "ZenMe-AU/ZenbloxCore" },
      });
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      throw new Error(`Unexpected GitHub write request blocked: ${request.method()} ${request.url()}`);
    }
    await route.abort("blockedbyclient");
  });

  return state;
}

export async function installMockBackend(page: Page, context?: BrowserContext) {
  if (context) {
    await context.addInitScript(() => {
      sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "backend" }));
    });
  }
  const variables: Record<string, string> = {};
  await page.route(`${MOCK_BACKEND_URL}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/getUser") return json(route, { user: mockUser });
    if (path === "/getOrgs") return json(route, { orgList: [] });
    if (path === "/getRepos") return json(route, { repoList: [] });
    if (path === "/checkTemplate") return json(route, { isTemplate: true, templateName: "ZenMe-AU/ZenbloxCore" });
    if (path === "/getBranches") return json(route, { branches: [] });
    if (path === "/generateRepo") {
      return json(
        route,
        {
          data: { id: 987654321, name: "mock-repository" },
          envSuccess: true,
          results: { envs: [] },
        },
        200
      );
    }
    if (path === "/createBranch") return json(route, { branch: { name: "PROD", commit: "mock-sha", protected: false } });
    if (path === "/getVariables") return json(route, { variables });
    if (path === "/createVariable" || path === "/updateVariable") {
      const body = request.postDataJSON() as { name: string; value: string };
      variables[body.name] = body.value;
      return json(route, {});
    }
    if (path === "/deleteVariable") {
      const body = request.postDataJSON() as { name: string };
      delete variables[body.name];
      return json(route, {});
    }
    if (path === "/logout") return json(route, {});
    return json(route, {});
  });
}

export async function installMockAzure(page: Page, initialState: Partial<MockAzureState> = {}): Promise<MockAzureState> {
  const roleAssignmentWrites = initialState.rbacAssigned
    ? [
        {
          url: `${AZURE_MANAGEMENT_URL}/subscriptions/${mockSubscriptionId}/providers/Microsoft.Authorization/roleAssignments/mock-existing`,
          scope: `/subscriptions/${mockSubscriptionId}`,
          roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${mockReaderRoleId}`,
          principalId: mockSpObjectId,
          principalType: "ServicePrincipal",
        },
      ]
    : [];
  const state: MockAzureState = {
    appDisplayName: initialState.appDisplayName ?? null,
    servicePrincipalCreated: initialState.servicePrincipalCreated ?? false,
    federatedSubjects: initialState.federatedSubjects ?? new Set(),
    rbacAssigned: initialState.rbacAssigned ?? false,
    tenants: initialState.tenants ?? [{ tenantId: mockTenantId, displayName: "Mock tenant" }],
    subscriptions: initialState.subscriptions ?? [
      { subscriptionId: mockSubscriptionId, displayName: "Mock subscription", tenantId: mockTenantId, state: "Enabled" },
    ],
    subscriptionResponseStatus: initialState.subscriptionResponseStatus ?? 200,
    roleAssignmentWrites,
    federatedCredentialWrites: initialState.federatedCredentialWrites ?? [],
    applicationCreationFailuresRemaining: initialState.applicationCreationFailuresRemaining ?? 0,
    applicationLookupFailureStatus: initialState.applicationLookupFailureStatus ?? null,
  };

  await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/subscriptions") && request.method() === "GET") {
      if (state.subscriptionResponseStatus !== 200) {
        return json(route, { error: { code: "MockSubscriptionError", message: "Mock subscription request failed" } }, state.subscriptionResponseStatus);
      }
      return json(route, { value: state.subscriptions });
    }
    if (path.endsWith("/tenants") && request.method() === "GET") return json(route, { value: state.tenants });
    if (/\/roleAssignments$/i.test(path) && request.method() === "GET") {
      const scope = path.slice(0, path.toLowerCase().indexOf("/providers/microsoft.authorization/roleassignments"));
      const principalMatch = url.searchParams.get("$filter")?.match(/assignedTo\('([^']+)'\)/i);
      return json(route, {
        value: roleAssignmentWrites
          .filter(
            (assignment) =>
              assignment.scope.toLowerCase() === scope.toLowerCase() &&
              (!principalMatch || assignment.principalId.toLowerCase() === principalMatch[1].toLowerCase())
          )
          .map((assignment) => ({
            properties: {
              roleDefinitionId: assignment.roleDefinitionId,
              principalId: assignment.principalId,
              principalType: assignment.principalType,
            },
          })),
      });
    }
    if (/\/roleAssignments\/[^/]+$/i.test(path) && request.method() === "PUT") {
      const body = request.postDataJSON() as {
        properties?: { roleDefinitionId?: string; principalId?: string; principalType?: string };
      };
      const scope = path.slice(0, path.toLowerCase().indexOf("/providers/microsoft.authorization/roleassignments"));
      const assignment: MockAzureRoleAssignmentWrite = {
        url: request.url(),
        scope,
        roleDefinitionId: body.properties?.roleDefinitionId ?? "",
        principalId: body.properties?.principalId ?? "",
        principalType: body.properties?.principalType,
      };
      roleAssignmentWrites.push(assignment);
      state.rbacAssigned =
        scope.toLowerCase() === `/subscriptions/${mockSubscriptionId}`.toLowerCase() &&
        assignment.roleDefinitionId.toLowerCase().endsWith(mockReaderRoleId) &&
        assignment.principalId === mockSpObjectId &&
        assignment.principalType === "ServicePrincipal";
      return json(route, {});
    }
    return json(route, {});
  });
  await page.route(`${MICROSOFT_GRAPH_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/v1.0/applications" && request.method() === "GET") {
      if (state.applicationLookupFailureStatus !== null) {
        return json(route, { error: { message: "Mock Graph permission denied" } }, state.applicationLookupFailureStatus);
      }
      const filter = url.searchParams.get("$filter") ?? "";
      if (filter.startsWith("displayName eq")) return json(route, { value: state.appDisplayName ? [{ appId: mockAppId, id: mockAppObjectId }] : [] });
      if (filter.startsWith("appId eq")) return json(route, { value: state.appDisplayName ? [{ displayName: state.appDisplayName }] : [] });
    }
    if (path === "/v1.0/applications" && request.method() === "POST") {
      if (state.applicationCreationFailuresRemaining > 0) {
        state.applicationCreationFailuresRemaining -= 1;
        return json(route, { error: { message: "Mock app creation failed" } }, 500);
      }
      const body = request.postDataJSON() as { displayName: string };
      state.appDisplayName = body.displayName;
      return json(route, { appId: mockAppId, id: mockAppObjectId }, 201);
    }
    if (path === "/v1.0/servicePrincipals" && request.method() === "GET")
      return json(route, { value: state.servicePrincipalCreated ? [{ id: mockSpObjectId }] : [] });
    if (path === "/v1.0/servicePrincipals" && request.method() === "POST") {
      state.servicePrincipalCreated = true;
      return json(route, { id: mockSpObjectId }, 201);
    }
    if (path.endsWith("/federatedIdentityCredentials") && request.method() === "GET")
      return json(route, { value: Array.from(state.federatedSubjects, (subject) => ({ subject })) });
    if (path.endsWith("/federatedIdentityCredentials") && request.method() === "POST") {
      const body = request.postDataJSON() as { name: string; issuer: string; subject: string; audiences: string[] };
      state.federatedSubjects.add(body.subject);
      state.federatedCredentialWrites.push({ url: request.url(), ...body });
      return json(route, {}, 201);
    }
    if (request.method() === "GET") return json(route, { value: [] });
    return json(route, {}, 201);
  });

  return state;
}

export async function installCreateDomainAzureMock(
	page: Page,
	domainName: string,
	initialState: Partial<CreateDomainAzureMockState> = {},
): Promise<CreateDomainAzureMockState> {
	const state: CreateDomainAzureMockState = {
		domainExists: initialState.domainExists ?? false,
		domainVerified: initialState.domainVerified ?? false,
		domainPrimary: initialState.domainPrimary ?? false,
		dnsZoneExists: initialState.dnsZoneExists ?? false,
		dnsTxtExists: initialState.dnsTxtExists ?? false,
		adminConsentGranted: initialState.adminConsentGranted ?? false,
	};
	const nameServers = ["ns1.mock.azure-dns.com.", "ns2.mock.azure-dns.net."];
	const verificationToken = "MS=ms12345678";

	await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const normalizedPath = path.toLowerCase();
		const zonePath = `/providers/microsoft.network/dnszones/${domainName.toLowerCase()}`;

		if (normalizedPath.endsWith(zonePath)) {
			if (request.method() === "GET") {
				return state.dnsZoneExists
					? json(route, { id: path, properties: { nameServers } })
					: json(route, { error: { code: "ResourceNotFound" } }, 404);
			}
			if (request.method() === "PUT") {
				state.dnsZoneExists = true;
				return json(route, { id: path, properties: { nameServers } });
			}
		}

		if (normalizedPath.endsWith(`${zonePath}/txt/@`)) {
			if (request.method() === "GET") {
				return state.dnsTxtExists
					? json(route, { properties: { TXTRecords: [{ value: [verificationToken] }] } })
					: json(route, { error: { code: "ResourceNotFound" } }, 404);
			}
			if (request.method() === "PUT") {
				state.dnsTxtExists = true;
				return json(route, {});
			}
		}

		return route.fallback();
	});

	await page.route(`${MICROSOFT_GRAPH_URL}/**`, async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const domainPath = `/v1.0/domains/${domainName}`;

		if (path === "/v1.0/domains" && request.method() === "GET") {
			return json(route, {
				value: state.domainExists && state.domainVerified
					? [{ id: domainName, isVerified: true, isDefault: state.domainPrimary, isInitial: false }]
					: [],
			});
		}
		if (path === "/v1.0/domains" && request.method() === "POST") {
			state.domainExists = true;
			return json(route, { id: domainName, isVerified: false, isDefault: false }, 201);
		}
		if (path === domainPath && request.method() === "GET") {
			return state.domainExists
				? json(route, { id: domainName, isVerified: state.domainVerified, isDefault: state.domainPrimary })
				: json(route, { error: { code: "Request_ResourceNotFound" } }, 404);
		}
		if (path === `${domainPath}/verificationDnsRecords` && request.method() === "GET") {
			return json(route, { value: [{ recordType: "Txt", text: verificationToken }] });
		}
		if (path === `${domainPath}/verify` && request.method() === "POST") {
			state.domainVerified = true;
			return json(route, { id: domainName, isVerified: true, isDefault: state.domainPrimary });
		}
		if (path === domainPath && request.method() === "PATCH") {
			state.domainPrimary = true;
			return json(route, {});
		}
		if (path.endsWith("/appRoleAssignments") && request.method() === "POST") {
			state.adminConsentGranted = true;
			return json(route, {}, 201);
		}

		return route.fallback();
	});

	return state;
}

export async function signInMockAzure(
  page: Page,
  additionalGraphScopeSets: string[][] = [],
  tenantIds: string[] = [mockTenantId],
  options: { accountTenantId?: string; armTokenTenantIds?: string[] } = {}
): Promise<string> {
	const localUrl = page.url();
	const accountTenantId = options.accountTenantId ?? mockTenantId;
	const armTokenTenantIds = options.armTokenTenantIds ?? [...new Set([mockTenantId, ...tenantIds])];
	await page.route(`${MICROSOFT_LOGIN_URL}/**`, async (route) => {
		await route.abort("blockedbyclient");
	});
	const authorizeRequest = page.waitForRequest((request) => {
		const url = new URL(request.url());
		return url.hostname === "login.microsoftonline.com" && url.searchParams.has("client_id");
	});
	await page.getByRole("button", { name: "Sign in with Azure", exact: true }).click();
	const clientId = new URL((await authorizeRequest).url()).searchParams.get("client_id");
	if (!clientId) throw new Error("The mocked Azure sign-in did not include a client ID.");

	await page.goto(localUrl);
	await page.evaluate(({ clientId, tenantId, tenantIds, tokenTenantIds, azureManagementScope, graphApplicationScope, graphAppRoleAssignmentScope, additionalGraphScopeSets }) => {
		const environment = "login.microsoftonline.com";
		const homeAccountId = `mock-home.${tenantId}`;
		const accountKey = `msal.3|${homeAccountId}|${environment}|${tenantId}`.toLowerCase();
		const tenantAccessTokenKeys = tokenTenantIds.map((id) => ["msal.3", homeAccountId, environment, "accesstoken", clientId, id, azureManagementScope, ""].join("|").toLowerCase());
		const graphTarget = [graphApplicationScope, graphAppRoleAssignmentScope].join(" ");
		const graphAccessTokenKey = ["msal.3", homeAccountId, environment, "accesstoken", clientId, tenantId, graphTarget, ""].join("|").toLowerCase();
		const additionalGraphTargets = additionalGraphScopeSets.map((scopes) => scopes.join(" "));
		const additionalGraphAccessTokenKeys = additionalGraphTargets.map((target) =>
			["msal.3", homeAccountId, environment, "accesstoken", clientId, tenantId, target, ""].join("|").toLowerCase(),
		);
		const additionalGraphScopes = [...new Set(additionalGraphScopeSets.flat())];
		const additionalGraphScopeKeys = additionalGraphScopes.map((scope) =>
					["msal.3", homeAccountId, environment, "accesstoken", clientId, tenantId, scope, ""].join("|").toLowerCase(),
		);
		const now = Math.floor(Date.now() / 1000);
		const username = "mock-user@example.com";

      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("msal.")) sessionStorage.removeItem(key);
      }

		sessionStorage.setItem("msal.3.account.keys", JSON.stringify([accountKey]));
		sessionStorage.setItem(accountKey, JSON.stringify({
			homeAccountId,
			environment,
			realm: tenantId,
			localAccountId: "mock-user-id",
			username,
			authorityType: "MSSTS",
			name: "Mock Azure User",
			...(tenantIds.length
				? {
						tenantProfiles: tenantIds.map((profileTenantId, index) => ({
							tenantId: profileTenantId,
							localAccountId: "mock-user-id",
							username,
							name: "Mock Azure User",
							isHomeTenant: index === 0,
						})),
					}
				: {}),
		}));
		sessionStorage.setItem(`msal.3.token.keys.${clientId}`, JSON.stringify({
			idToken: [],
			accessToken: [...tenantAccessTokenKeys, graphAccessTokenKey, ...additionalGraphAccessTokenKeys],
			refreshToken: [],
		}));
		const baseToken = {
			homeAccountId,
			credentialType: "AccessToken",
			secret: "mock-access-token",
			cachedAt: now.toString(),
			expiresOn: (now + 3600).toString(),
			extendedExpiresOn: (now + 7200).toString(),
			environment,
			clientId,
			tokenType: "Bearer",
		};
		for (const [index, id] of tokenTenantIds.entries()) {
			sessionStorage.setItem(
				tenantAccessTokenKeys[index],
				JSON.stringify({ ...baseToken, realm: id, target: azureManagementScope })
			);
		}
		const token = { ...baseToken, realm: tenantId };
		sessionStorage.setItem(graphAccessTokenKey, JSON.stringify({ ...token, target: graphTarget }));
		// Consent bundles cover setup while individual entries satisfy later single-scope API calls.
		for (const [index, key] of additionalGraphAccessTokenKeys.entries()) {
			sessionStorage.setItem(key, JSON.stringify({ ...token, target: additionalGraphTargets[index] }));
		}
		for (const [index, key] of additionalGraphScopeKeys.entries()) {
			sessionStorage.setItem(key, JSON.stringify({ ...token, target: additionalGraphScopes[index] }));
		}
	}, {
		clientId,
		tenantId: accountTenantId,
		tenantIds,
		tokenTenantIds: armTokenTenantIds,
		azureManagementScope: AZURE_MANAGEMENT_SCOPE,
		graphApplicationScope: GRAPH_APPLICATION_SCOPE,
		graphAppRoleAssignmentScope: GRAPH_APP_ROLE_ASSIGNMENT_SCOPE,
		additionalGraphScopeSets,
	});

	await page.reload();
	return clientId;
}

export async function cacheMockAzureGraphScopeSets(page: Page, clientId: string, scopeSets: string[][]) {
	await page.evaluate(({ clientId, tenantId, scopeSets }) => {
		const environment = "login.microsoftonline.com";
		const homeAccountId = `mock-home.${tenantId}`;
		const tokenKeysStorageKey = `msal.3.token.keys.${clientId}`;
		const tokenKeys = JSON.parse(sessionStorage.getItem(tokenKeysStorageKey) ?? '{"idToken":[],"accessToken":[],"refreshToken":[]}');
		const baseTokenKey = tokenKeys.accessToken.find((key: string) => {
			const token = JSON.parse(sessionStorage.getItem(key) ?? "null");
			return token?.target?.includes("management.azure.com");
		});
		if (!baseTokenKey) throw new Error("The mocked Azure sign-in has no cached ARM access token.");
		const baseToken = JSON.parse(sessionStorage.getItem(baseTokenKey)!);

		for (const scopes of scopeSets) {
			const target = [...scopes].map((scope) => scope.toLowerCase()).sort().join(" ");
			const key = ["msal.3", homeAccountId, environment, "accesstoken", clientId, tenantId, target, ""]
				.join("|")
				.toLowerCase();
			sessionStorage.setItem(key, JSON.stringify({ ...baseToken, target }));
			if (!tokenKeys.accessToken.includes(key)) tokenKeys.accessToken.push(key);
		}

		sessionStorage.setItem(tokenKeysStorageKey, JSON.stringify(tokenKeys));
	}, { clientId, tenantId: mockTenantId, scopeSets });
}

export { mockSubscriptionId, mockTenantId, mockSecondTenantId, mockSecondSubscriptionId };

export async function prepareMockAzureSubscription(
	page: Page,
	context: BrowserContext,
	repoName: string,
	options: {
		initialVariables?: Record<string, string>;
		saveVariables?: boolean;
		initialAzureState?: Partial<MockAzureState>;
		additionalGraphScopeSets?: string[][];
		tenantIds?: string[];
		existingRepository?: boolean;
		url?: string;
	} = {},
) {
	const github = await installMockGitHub(page, context, {
		initialVariables: options.initialVariables,
		repositoryName: options.existingRepository ? repoName : undefined,
	});
	const azure = await installMockAzure(page, options.initialAzureState);
	await page.goto(options.url ?? CORP_URL);

	const azureLoginCard = await expandAzureLoginCard(page);
	await signInMockAzure(page, options.additionalGraphScopeSets, options.tenantIds);
	await expect(azureLoginCard.getByText(/Signed in as/i)).toBeVisible();
	await expect(azureLoginCard.getByText("Loading tenants...", { exact: true })).toBeHidden();
	const tenantSelect = azureLoginCard.getByTestId("tenant-select");
	await expect(tenantSelect).toBeVisible();
	await tenantSelect.click();
	await page.getByRole("option", { name: /Mock tenant/i }).click();

  const repoCard = await expandRepoCard(page);
  if (options.existingRepository) {
    await chooseExistingRepo(page, repoCard, repoName);
  } else {
    await createNewRepo(page, repoCard, repoName);
  }
  await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
  const prodEnvironment = repoCard.getByText("PROD", { exact: true });
  await expect(prodEnvironment).toBeVisible();
  await prodEnvironment.click();
  const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
  if (await createProdButton.isVisible()) {
    await createProdButton.click();
    await expect(createProdButton).toBeHidden();
  }

  const azureSubscriptionCard = await expandAzureSubscriptionCard(page);
  await expect(azureSubscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden();
  const subscriptionState = azureSubscriptionCard
    .getByRole("combobox")
    .or(azureSubscriptionCard.getByText("This tenant has no subscriptions you can access.", { exact: true }))
    .or(azureSubscriptionCard.getByText(/Couldn't load subscriptions for this tenant/));
  await expect(subscriptionState).toBeVisible();

  if (options.saveVariables) {
    const saveButton = azureSubscriptionCard.getByRole("button", { name: /^Save(?: \d+)? variables?$/ });
    if (await saveButton.isEnabled()) await saveButton.click();
    await expect(saveButton).toBeDisabled();
  }

  const tenantVariableInput = azureSubscriptionCard.getByText("AZURE_TENANT_ID", { exact: true }).locator("..").locator("..").getByRole("textbox");
  const subscriptionVariableInput = azureSubscriptionCard.getByText("AZURE_SUBSCRIPTION_ID", { exact: true }).locator("..").locator("..").getByRole("textbox");
  const saveButton = azureSubscriptionCard.getByRole("button", { name: "Save variables", exact: true });

  return {
    azureLoginCard,
    azureSubscriptionCard,
    repoCard,
    tenantVariableInput,
    subscriptionVariableInput,
    saveButton,
    github,
    azure,
  };
}

export const savedAzureVariables = {
  AZURE_TENANT_ID: mockTenantId,
  AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
  VITE_AZURE_TENANT_ID: mockTenantId,
};
