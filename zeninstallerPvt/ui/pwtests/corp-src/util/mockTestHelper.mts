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
import { expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard, openBackendCard } from "./cardHelper.mts";
import { chooseExistingRepo, createNewRepo } from "./testHelper.mts";
import { TEST_REPO_MAIN } from "../../testInit.js";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "./setupHelper.mjs";

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
  const slug = companyShortCode.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const storage = `zbcore${companyShortCode.toLowerCase().replace(/[^a-z0-9]/g, "")}stor`;
  return [
    "Confirm Microsoft permissions",
    "Register required Azure resource providers",
    `Create resource group zbcore-${slug}-rg`,
    "Grant GitHub Actions access to the resource group",
    `Create Log Analytics workspace zbcore-${slug}-law`,
    "Configure subscription activity-log diagnostics",
    `Create storage account ${storage}`,
    "Create terraformstate container",
    "Lock the storage account against deletion",
    "Send state writes and deletes to the workspace",
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
    if (/^\/subscriptions\/[^/]+\/resourcegroups\/zbcore-pwtests-rg$/i.test(path)) return "resource-group";
    if (/\/workspaces\/zbcore-pwtests-law$/i.test(path)) return "log-analytics";
    if (/\/blobservices\/default\/providers\/microsoft\.insights\/diagnosticsettings\/standard-diagnostics-setting$/i.test(path)) return "blob-diagnostics";
    if (/\/diagnosticsettings\/standard-diagnostics-setting$/i.test(path)) return "diagnostics";
    if (/\/storageaccounts\/zbcorepwtestsstor$/i.test(path)) return "storage-account";
    if (/\/storageaccounts\/zbcorepwtestsstor\/providers\/microsoft\.authorization\/locks\/tfstate-cannot-delete$/i.test(path)) return "storage-lock";
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
				/\/resourcegroups\/zbcore-pwtests-rg$/i.test(scope) || /\/storageaccounts\/zbcorepwtestsstor$/i.test(scope);
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

    if (/^\/subscriptions\/[^/]+\/providers\/microsoft\.storage\/storageaccounts$/i.test(path) && method === "GET") {
      const subscription = path.split("/")[2];
      return json(route, {
        value: state.createdResources.has("storage-account")
          ? [{ name: "zbcorepwtestsstor", id: `/subscriptions/${subscription}/resourceGroups/zbcore-pwtests-rg/providers/Microsoft.Storage/storageAccounts/zbcorepwtestsstor` }]
          : [],
      });
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
  const roleAssignmentWrites: MockAzureRoleAssignmentWrite[] = initialState.rbacAssigned
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

export async function prepareExistingBackend(page: Page, context: BrowserContext, viewportName: string) {
	await restoreGithubSessionStorage(context);
	await restoreAzureSessionStorage(context);
	await page.goto(CORP_URL);
	const azureCard = await expandAzureLoginCard(page);
	const tenantSelect = azureCard.getByTestId("tenant-select");
	await expect(tenantSelect).toBeVisible({ timeout: 60_000 });
	const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
	expect(tenantId).not.toBe("");
	await tenantSelect.click();
	await page.getByRole("option").filter({ hasText: tenantId }).click();
	const repoName = `${TEST_REPO_MAIN}-${viewportName}`;
	const repoCard = await expandRepoCard(page);
	await chooseExistingRepo(page, repoCard, repoName);
	await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
	await repoCard.getByText("PROD", { exact: true }).click();

	// Read existing configuration only; no repository, variable, or infrastructure writes.
	const variables = await page.evaluate(async ({ repoName }) => {
		const auth = JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null");
		if (auth?.mode !== "direct" || !auth.token) throw new Error("This integration test requires existing GitHub PAT session state.");
		const headers = { Authorization: `Bearer ${auth.token}`, Accept: "application/vnd.github+json" };
		const userResponse = await fetch("https://api.github.com/user", { headers });
		if (!userResponse.ok) throw new Error(`Reading GitHub identity failed: ${userResponse.status}`);
		const user = await userResponse.json();
		const entries: { name: string; value: string }[] = [];
		for (let page = 1; ; page++) {
			const response = await fetch(`https://api.github.com/repos/${user.login}/${repoName}/environments/PROD/variables?per_page=100&page=${page}`, { headers });
			if (!response.ok) throw new Error(`Reading existing PROD variables failed: ${response.status}`);
			const data = await response.json() as { variables: { name: string; value: string }[] };
			entries.push(...data.variables);
			if (data.variables.length < 100) break;
		}
		return Object.fromEntries(entries.map(({ name, value }) => [name, value]));
	}, { repoName });
	for (const key of ["NAME", "AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID", "WEBPUBSUB_ENDPOINT",
		"WEBPUBSUB_CLIENT_ID", "WEBPUBSUB_TENANT_ID", "BACKEND_API"]) {
		expect(variables[key], `Existing PROD variable ${key} is required; run the prerequisite card separately`).toBeTruthy();
	}
	expect(variables.AZURE_TENANT_ID, "Use the tenant already saved in PROD").toBe(tenantId);
	expect(variables.BACKEND_API).toBe(`https://${variables.NAME}-terminal-app.azurewebsites.net`);
	await page.evaluate((values) => {
		localStorage.setItem("zeninstaller_remote_terminal_infra_result", JSON.stringify({
			corpName: values.NAME, subscriptionId: values.AZURE_SUBSCRIPTION_ID,
			apiUrl: values.BACKEND_API, webPubSubHost: values.WEBPUBSUB_ENDPOINT, hubName: "terminal",
			pipelineClientId: values.WEBPUBSUB_CLIENT_ID, pipelineTenantId: values.WEBPUBSUB_TENANT_ID,
		}));
	}, variables);
	await page.reload();
	const readLatestBuild = () => page.evaluate(async ({ repoName }) => {
		const auth = JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null");
		if (auth?.mode !== "direct" || !auth.token) throw new Error("Reading the backend build requires existing GitHub PAT session state.");
		const modulePath = "/corp-src/api/github.ts";
		const { createGithubApi, fetchGithubUser }: typeof import("../../../corp-src/api/github.ts") = await import(modulePath);
		const user = await fetchGithubUser(auth.token);
		const report = await createGithubApi(auth.token).fetchStageReport({ ...user, type: "User" }, repoName, "PROD", "backend", "build");
		if (!report) return null;
		const build: unknown = report.stage;
		if (!build || typeof build !== "object"
			|| !("version" in build) || typeof build.version !== "string"
			|| !("sha" in build) || typeof build.sha !== "string"
			|| !("runId" in build) || typeof build.runId !== "string"
			|| !("artifactId" in build) || (build.artifactId !== null && typeof build.artifactId !== "number")
			|| !("builtAt" in build) || typeof build.builtAt !== "number") {
			throw new Error("The latest backend build report has an invalid payload.");
		}
		return {
			version: build.version, sha: build.sha, runId: build.runId,
			artifactId: typeof build.artifactId === "number" ? build.artifactId : null, builtAt: build.builtAt,
		};
	}, { repoName });
	return { card: await openBackendCard(page), appName: `${variables.NAME}-terminal-app`, variables, readLatestBuild };
}

const sha = "abcdef1234567890abcdef1234567890abcdef12";
export const previousBuild = {
	version: "mock-backend-v0", sha: "1234567890abcdef1234567890abcdef12345678",
	runId: "11111", artifactId: 67889, builtAt: 1_755_000_000,
};
export const backendBuild = {
	version: "mock-backend-v1", sha, runId: "22222", artifactId: 67890, builtAt: 1_759_622_400,
};

type BuildOutcome = "success" | "failed" | "cancelled" | "timeout";
type DeploymentOutcome = "success" | "failed" | "timeout";
type SeedBuild = "current" | "update";

export type MockBackendOptions = {
	missingArtifact?: boolean;
	failUploadOnce?: boolean;
	failBuild?: boolean;
	buildOutcome?: BuildOutcome;
	artifactDownloadStatus?: number;
	deploymentOutcome?: DeploymentOutcome;
	failSettingsWrite?: boolean;
	failVersionRead?: boolean;
	seedBuild?: SeedBuild;
};

export async function prepareMockBackend(
	page: Page, context: BrowserContext, viewportName: string, options: MockBackendOptions = {},
) {
	await page.clock.install({ time: new Date("2026-10-05T02:00:00Z") });
	const unexpectedRequests = await installRelayNetworkGuard(context);
	const repoName = `${TEST_REPO_MAIN}-${viewportName}`;
	const corpName = "pwtests";
	const installerClientId = "00000000-0000-0000-0000-000000000006";
	const appInsightsConnectionString = "InstrumentationKey=mock-key;IngestionEndpoint=https://mock.applicationinsights.azure.com/";
	const initialVariables = {
		NAME: corpName,
		AZURE_TENANT_ID: mockTenantId,
		AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
		WEBPUBSUB_ENDPOINT: "pwtests-wpubsub.webpubsub.azure.com",
		WEBPUBSUB_CLIENT_ID: "00000000-0000-0000-0000-000000000005",
		WEBPUBSUB_TENANT_ID: mockTenantId,
		VITE_API_URL: "https://pwtests-terminal-app.azurewebsites.net",
		VITE_AZURE_CLIENT_ID: installerClientId,
		VITE_APPINSIGHTS_CONNECTION_STRING: appInsightsConnectionString,
	};
	await context.addInitScript((values) => {
		localStorage.setItem("zeninstaller_azure_result", JSON.stringify({
			clientId: values.installerClientId, tenantId: values.tenantId, subscriptionIds: [values.subscriptionId],
		}));
		localStorage.setItem("zeninstaller_infra_result", JSON.stringify({
			corpName: values.corpName, subscriptionId: values.subscriptionId,
		}));
		localStorage.setItem("zeninstaller_remote_terminal_infra_result", JSON.stringify({
			corpName: values.corpName, subscriptionId: values.subscriptionId,
			apiUrl: values.apiUrl, webPubSubHost: values.webPubSubHost, hubName: "terminal",
			pipelineClientId: values.pipelineClientId, pipelineTenantId: values.tenantId,
			installerClientId: values.installerClientId, appInsightsConnectionString: values.appInsightsConnectionString,
		}));
		sessionStorage.setItem("zeninstaller_arm_tenant", values.tenantId);
	}, {
		installerClientId, tenantId: mockTenantId, subscriptionId: mockSubscriptionId, corpName,
		apiUrl: initialVariables.VITE_API_URL, webPubSubHost: initialVariables.WEBPUBSUB_ENDPOINT,
		pipelineClientId: initialVariables.WEBPUBSUB_CLIENT_ID, appInsightsConnectionString,
	});
	await page.route(/\/corp-src\/auth\/msal\.ts(?:\?.*)?$/, (route) => route.fulfill({
		contentType: "application/javascript",
		body: `
			export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
			export const PINNED_TENANT_ID = "${mockTenantId}";
			export const LOGIN_AUTHORITY = "https://login.microsoftonline.com/${mockTenantId}";
			export const cleanTenantId = tenant => tenant?.trim().toLowerCase();
			const account = { homeAccountId: "mock-home", environment: "login.microsoftonline.com",
				tenantId: "${mockTenantId}", localAccountId: "mock-user", username: "mock-user@example.com",
				name: "Mock Azure User", tenantProfiles: new Map() };
			const reject = async () => { throw new Error("Unexpected authentication redirect in backend mock"); };
			export const getMsal = async () => ({ handleRedirectPromise: async () => null,
				getAllAccounts: () => [account], acquireTokenSilent: async () => ({ account, accessToken: "mock-token" }),
				loginRedirect: reject, acquireTokenRedirect: reject, clearCache: async () => {} });
			export const ensureScopeConsent = async () => false;
			export const getToken = async () => "mock-token";
			let active;
			export const setActiveAzureIdentity = value => { active = value; };
			export const getMsToken = async () => active ? "mock-token" : null;
			export const requireMsToken = async () => {
				if (!active) throw new Error("No mocked account selected");
				return "mock-token";
			};
		`,
	}));
	const github = await installMockGitHub(page, context, {
		repositoryName: repoName, branches: ["main", "PROD"], initialVariables,
	});
	const azure = await installMockAzure(page, {
		appDisplayName: "zeninstaller-pwtests", servicePrincipalCreated: true, rbacAssigned: true,
	});
	const seededBuild = options.seedBuild
		? options.missingArtifact
			? { ...backendBuild, artifactId: null }
			: backendBuild
		: options.missingArtifact || options.failUploadOnce
			? options.missingArtifact ? { ...backendBuild, artifactId: null } : backendBuild
			: null;
	const state = {
		latestBuild: seededBuild,
		buildDispatched: false,
		dispatches: [] as { ref: string; inputs: { github_env_name: string } }[],
		downloads: 0,
		uploads: 0,
		deployRequests: 0,
		deploymentPolls: 0,
		deploymentPollsAfterUpload: 0,
		settingsReads: 0,
		settingsWriteAttempts: 0,
		settingsWrites: 0,
		settings: {
			ALLOWED_ORIGINS: new URL(CORP_URL).origin, SESSION_TABLE_NAME: "sessions",
			WEBPUBSUB_ENDPOINT: "pwtests-wpubsub.webpubsub.azure.com",
			...(options.seedBuild === "current" ? {
				BACKEND_VERSION: backendBuild.version, BACKEND_SHA: backendBuild.sha, BACKEND_BUILT_AT: String(backendBuild.builtAt),
			} : options.seedBuild === "update" ? {
				BACKEND_VERSION: previousBuild.version, BACKEND_SHA: previousBuild.sha, BACKEND_BUILT_AT: String(previousBuild.builtAt),
			} : {}),
		} as Record<string, string>,
	};
	const zip = Buffer.from("504b0506000000000000000000000000000000000000", "hex");
	await page.route(`${GITHUB_API_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.pathname.endsWith("/deployments") && url.searchParams.get("task") === "build:backend") {
			expect(url.searchParams.get("environment")).toBe("PROD");
			const nextBuild = state.buildDispatched && options.buildOutcome === "success" ? backendBuild : state.latestBuild;
			return route.fulfill({ json: nextBuild ? [{
				payload: nextBuild,
				created_at: new Date(nextBuild.builtAt * 1000).toISOString(), sha: nextBuild.sha,
			}] : [] });
		}
		if (url.pathname.endsWith("/actions/workflows/buildBackend.yml/dispatches") && request.method() === "POST") {
			state.dispatches.push(request.postDataJSON());
			if (options.failBuild) return route.fulfill({ status: 403, json: { message: "Mock build permission denied" } });
			state.buildDispatched = true;
			if (!options.buildOutcome || options.buildOutcome === "success") state.latestBuild = backendBuild;
			return route.fulfill({ status: 204 });
		}
		if (url.pathname.endsWith(`/actions/artifacts/${state.latestBuild?.artifactId}/zip`) && state.latestBuild?.artifactId != null) {
			state.downloads++;
			if (options.artifactDownloadStatus) {
				return route.fulfill({ status: options.artifactDownloadStatus, body: "Mock artifact expired" });
			}
			return route.fulfill({ contentType: "application/zip", body: zip, headers: { "Content-Length": String(zip.length) } });
		}
		if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
			unexpectedRequests.push(`${request.method()} ${request.url()}`);
			return route.abort("blockedbyclient");
		}
		return route.fallback();
	});

	const appSettingsPath = "/sites/pwtests-terminal-app/config/appsettings";
	const appPath = "/subscriptions/mock-subscription/resourcegroups/root-pwtests/providers/microsoft.web/sites/pwtests-terminal-app";
	await page.route(`${AZURE_MANAGEMENT_URL}/**`, async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname.toLowerCase();
		const method = request.method();
		if (path.endsWith(`${appSettingsPath}/list`) && method === "POST") {
			state.settingsReads++;
			if (options.failVersionRead && state.settingsWrites > 0) {
				return route.fulfill({ status: 503, body: "Mock app-settings read failure" });
			}
			return route.fulfill({ json: { properties: state.settings } });
		}
		if (path.endsWith(appSettingsPath) && method === "PUT") {
			state.settingsWriteAttempts++;
			if (options.failSettingsWrite) {
				return route.fulfill({ status: 503, body: "Mock app-settings write failure" });
			}
			state.settingsWrites++;
			state.settings = (request.postDataJSON() as { properties: Record<string, string> }).properties;
			return route.fulfill({ json: { properties: state.settings } });
		}
		if (path.endsWith(`${appPath}/extensions/onedeploy`) && method === "PUT") {
			state.deployRequests++;
			state.uploads++;
			expect(request.headers()["content-type"]).toBe("application/zip");
			expect(request.postDataBuffer()).toEqual(zip);
			if (options.failUploadOnce && state.uploads === 1) {
				return route.fulfill({ status: 500, body: "Mock upload failure" });
			}
			return route.fulfill({ status: 202, json: {} });
		}
		if (path.endsWith(`${appPath}/deployments`) && method === "GET") {
			state.deploymentPolls++;
			if (state.uploads > 0) state.deploymentPollsAfterUpload++;
			if (options.deploymentOutcome === "timeout") return route.fulfill({ json: { value: [] } });
			return route.fulfill({ json: { value: [{
				properties: options.deploymentOutcome === "failed"
					? { status: 3, message: "Mock package unpack failure", end_time: new Date(Date.now()).toISOString() }
					: { status: 4, end_time: new Date(Date.now()).toISOString() },
			}] } });
		}
		if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
			unexpectedRequests.push(`${method} ${request.url()}`);
			return route.abort("blockedbyclient");
		}
		return route.fallback();
	});
	await page.route("https://pwtests-terminal-app.scm.azurewebsites.net/**", async (route) => {
		unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
		await route.abort("blockedbyclient");
	});
	const url = new URL(CORP_URL);
	url.search = new URLSearchParams({
		account: "mock-user", repo: repoName, env: "PROD", tenant: mockTenantId, subscription: mockSubscriptionId,
	}).toString();
	await page.goto(url.toString());
	await page.reload();
	return { card: await openBackendCard(page), state, initialVariables, github, azure, tenantId: mockTenantId, unexpectedRequests };
}

export async function prepareGithubLoginMock(page: Page, context: BrowserContext, backendAvailable = true) {
  const unexpectedRequests = await installRelayNetworkGuard(context);
  await page.route(`${GITHUB_API_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    expect(route.request().method(), "Authentication fixtures must never write to GitHub").toBe("GET");
    if (path === "/user") {
      expect(route.request().headers().authorization).toBe("Bearer ghp_mock");
      return route.fulfill({ json: { login: "mock-user", id: 12345 } });
    }
    if (path === "/user/orgs" || path === "/user/repos") return route.fulfill({ json: [] });
    unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort("blockedbyclient");
  });
  await installMockBackend(page);
  await page.route(/\/corp-src\/api\/backend\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const configuration = "const url = import.meta.env.VITE_API_URL;";
    expect(source).toContain(configuration);
    await route.fulfill({
      response,
      body: source.replace(configuration, `const url = ${backendAvailable ? JSON.stringify(MOCK_BACKEND_URL) : "undefined"};`),
    });
  });
  await page.goto(CORP_URL);
  return { unexpectedRequests };
}

export async function installGithubOAuthCallback(page: Page) {
  const exchanges: Record<string, string>[] = [];
  const authorizations: URL[] = [];
  await page.route("https://github.com/login/oauth/authorize?**", async (route) => {
    const url = new URL(route.request().url());
    authorizations.push(url);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("scope")).toContain("repo");
    const callback = new URL(CORP_URL);
    callback.searchParams.set("code", "mock-oauth-code");
    callback.searchParams.set("state", url.searchParams.get("state") ?? "");
    await route.fulfill({ status: 302, headers: { location: callback.toString() }, body: "" });
  });
  await page.route(`${MOCK_BACKEND_URL}/getGhToken`, async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as Record<string, string>;
    expect(body.code).toBe("mock-oauth-code");
    expect(body.redirect_uri).toBe(new URL(CORP_URL).origin);
    expect(body.code_verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    exchanges.push(body);
    await route.fulfill({ json: { access_token: "mock-oauth-token" } });
  });
  await page.route(`${GITHUB_API_URL}/user`, (route) => {
    expect(route.request().headers().authorization).toBe("Bearer mock-oauth-token");
    return route.fulfill({ json: { login: "mock-user", id: 12345 } });
  });
  return { exchanges, authorizations };
}



export async function installRelayNetworkGuard(context: BrowserContext) {
	const unexpectedRequests: string[] = [];
	await context.route("**/*", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.origin === new URL(CORP_URL).origin) return route.continue();

		unexpectedRequests.push(`${request.method()} ${request.url()}`);
		await route.abort("blockedbyclient");
	});
	await context.route("https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json", (route) =>
		route.fulfill({ json: { enabled: false } }));
	await context.route("https://australiaeast-1.in.applicationinsights.azure.com/v2/track", (route) =>
		route.fulfill({ json: { itemsReceived: 0, itemsAccepted: 0, errors: [] } }));
	return unexpectedRequests;
}
