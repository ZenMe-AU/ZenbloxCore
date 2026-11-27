/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useState } from "react";
import {
  appInsightsScope,
  ensureAppInsights,
  ensureBlobDiagnostics,
  ensureBlobServiceProperties,
  ensureDeleteLock,
  ensureDnsTxtRecord,
  ensureDnsZone,
  ensureFlexFunctionApp,
  ensureFlexServicePlan,
  ensureLogAnalyticsWorkspace,
  ensureRbacRoleAtScope,
  ensureResourceGroup,
  ensureStorageAccount,
  ensureStorageContainer,
  ensureStorageTable,
  ensureSubscriptionDiagnostics,
  ensureWebPubSub,
  ensureWebPubSubHub,
  findFunctionAppGroup,
  findStorageAccountGroup,
  findWebPubSubGroup,
  functionAppNameAvailable,
  getAppInsightsConnectionString,
  getStaticWebsiteUrl,
  resourceGroupScope,
  servicePlanId,
  storageAccountNameAvailable,
  storageAccountScope,
  webPubSubNameAvailable,
  webPubSubScope,
} from "../../api/azureArm";
import {
  createAppRegistration,
  createEntraDomain,
  createServicePrincipal,
  createSpaAppRegistration,
  ensureFederatedCredential,
  ensureSpaRedirectUri,
  getDomainVerificationTxt,
  getEntraDomain,
  getExistingApp,
  getExistingSP,
} from "../../api/azureGraph";
import { ensureScopeConsent } from "../../auth/msal";
import { PRIVATE_INSTALLER_DELEGATED, STORAGE_SCOPES } from "../../config/azureConfig";
import { isConsentError } from "../../logic/consent";
import {
  DIAGNOSTIC_SETTING_NAME,
  getFederatedCredential,
  getPrivateInstallerAppName,
  TERMINAL_DEPLOY_CONTAINER,
  TERMINAL_HUB,
  TERMINAL_SESSION_TABLE,
  TFSTATE_CONTAINER,
  TFSTATE_LOCK_NAME,
} from "../../logic/naming";
import { ConsentRedirectError, ResourceNameError, type ProvisionTaskDef, type TaskContext, type TaskOutcome } from "../../logic/provisioning";
import type { Account, AzureAccount } from "../../types";

// Ids for tasks several hosting parts do on the same target, so a combined run does each once.
const coreTaskIds = {
  resourceGroup: (subscriptionId: string, resourceGroup: string) => `arm:${subscriptionId}/resourceGroups/${resourceGroup}`,
  workspace: (subscriptionId: string, resourceGroup: string, workspace: string) => `arm:${subscriptionId}/resourceGroups/${resourceGroup}/workspaces/${workspace}`,
  subscriptionDiagnostics: (subscriptionId: string, setting: string) => `arm:${subscriptionId}/diagnosticSettings/${setting}`,
  blobService: (storageAccount: string) => `arm:storage/${storageAccount}/blobServices/default`,
};

type Target = { azureAccount: AzureAccount | null; subscriptionId: string; tenantId?: string; location: string };

// ─── Resource names ───────────────────────────────────────────────────────────

type NameRule = {
  maxLength: number;
  charset: RegExp; // What may be typed; checked on every keystroke.
  charsetError: string;
  pattern: RegExp; // The whole name Azure accepts; checked on confirm.
  patternError: string;
  // True when the name is this subscription's own resource, which is reused, or still free in Azure.
  usable: (target: Target & { azureAccount: AzureAccount }, name: string) => Promise<boolean>;
};

export const STORAGE_NAME: NameRule = {
  maxLength: 24,
  charset: /^[a-z0-9]*$/,
  charsetError: "Lowercase letters and digits only",
  pattern: /^[a-z0-9]{3,24}$/,
  patternError: "3-24 characters, lowercase letters and digits only",
  usable: async ({ azureAccount, subscriptionId, tenantId }, name) =>
    !!(await findStorageAccountGroup(azureAccount, subscriptionId, name, tenantId)) || storageAccountNameAvailable(azureAccount, subscriptionId, name, tenantId),
};

export const WEB_PUBSUB_NAME: NameRule = {
  maxLength: 63,
  charset: /^[a-z0-9-]*$/,
  charsetError: "Lowercase letters, digits and hyphens only",
  pattern: /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/,
  patternError: "3-63 characters: lowercase letters, digits and hyphens, starting with a letter",
  usable: async ({ azureAccount, subscriptionId, tenantId, location }, name) =>
    !!(await findWebPubSubGroup(azureAccount, subscriptionId, name, tenantId)) || webPubSubNameAvailable(azureAccount, subscriptionId, location, name, tenantId),
};

export const FUNCTION_APP_NAME: NameRule = {
  maxLength: 60,
  charset: /^[a-z0-9-]*$/,
  charsetError: "Lowercase letters, digits and hyphens only",
  pattern: /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/,
  patternError: "2-60 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen",
  usable: async ({ azureAccount, subscriptionId, tenantId }, name) =>
    !!(await findFunctionAppGroup(azureAccount, subscriptionId, name, tenantId)) || functionAppNameAvailable(azureAccount, subscriptionId, name, tenantId),
};

// An editable resource name, in the shape the resource row's name editor takes.
export type ResourceName = {
  name: string;
  apply: (name: string) => void;
  check: (name?: string) => Promise<boolean>;
  checking: boolean;
  error: string | null;
};

// The fallback is the name until one is typed; too long or bad characters show as you type, too short or taken only on confirm.
export function useResourceName(target: Target, rule: NameRule, fallback: string): ResourceName {
  const { azureAccount, subscriptionId, tenantId, location } = target;
  const [override, setOverride] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = override || fallback;

  const apply = useCallback((next: string) => {
    setOverride(next);
    setError(next.length > rule.maxLength ? `${next.length} characters; Azure allows ${rule.maxLength}` : rule.charset.test(next) ? null : rule.charsetError);
  }, [rule]);

  const check = useCallback(async (candidate = name): Promise<boolean> => {
    if (!rule.pattern.test(candidate)) {
      setError(rule.patternError);
      return false;
    }
    if (!azureAccount || !subscriptionId) return true;
    setChecking(true);
    setError(null);
    try {
      if (await rule.usable({ azureAccount, subscriptionId, tenantId, location }, candidate)) return true;
      setError("This name is taken somewhere in Azure — choose a different one");
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the name");
      return false;
    } finally {
      setChecking(false);
    }
  }, [azureAccount, subscriptionId, tenantId, location, name, rule]);

  return { name, apply, check, checking, error };
}

// The signed-in account, or the part's own message when its inputs aren't set yet.
const accountOrThrow = (azureAccount: AzureAccount | null, ready: boolean, message: string) => () => {
  if (!ready || !azureAccount) throw new Error(message);
  return azureAccount;
};

const exists = (result: "created" | "exists", already = "Already exists", created?: string): TaskOutcome =>
  result === "exists" ? { status: "skipped", detail: already } : { status: "completed", detail: created };

const groupOf = (output: TaskContext["output"], key: string) => output<{ group: string }>(key).group;

type Need = () => AzureAccount;
type Step = (ctx: TaskContext) => Promise<TaskOutcome>;

// A 403 on a subscription path goes to the part's access check.
export const onForbidden = (report: (error: unknown) => void) => (error: unknown) => {
  if (error instanceof Error && /^403 \/subscriptions\//.test(error.message)) report(error);
};

// The group and its workspace; parts on the same group share both tasks through their ids.
function groupAndWorkspace({ subscriptionId, tenantId, location }: Target, need: Need, resourceGroupName: string, lawName: string, wrap = (step: Step) => step): ProvisionTaskDef[] {
  return [
    {
      key: "rg",
      id: coreTaskIds.resourceGroup(subscriptionId, resourceGroupName),
      label: `Create resource group ${resourceGroupName}`,
      run: wrap(async () => exists(await ensureResourceGroup(need(), subscriptionId, resourceGroupName, location, tenantId))),
    },
    {
      key: "law",
      id: coreTaskIds.workspace(subscriptionId, resourceGroupName, lawName),
      label: `Create Log Analytics workspace ${lawName}`,
      dependsOn: ["rg"],
      run: wrap(async () => {
        const law = await ensureLogAnalyticsWorkspace(need(), subscriptionId, resourceGroupName, lawName, location, tenantId);
        return { ...exists(law.result), output: law.id };
      }),
    },
  ];
}

// A storage account whose output is the group it lives in, which may not be the part's own.
function storageAccount({ subscriptionId, tenantId, location }: Target, need: Need, task: { key: string; resourceKey: string; name: string; resourceGroupName: string }): ProvisionTaskDef {
  const { key, resourceKey, name, resourceGroupName } = task;
  return {
    key,
    label: `Create storage account ${name}`,
    dependsOn: ["rg"],
    resourceKey,
    run: async () => {
      if (!STORAGE_NAME.pattern.test(name)) throw new ResourceNameError(`"${name}" can't be a storage account name (3-24 lowercase letters and digits) — edit it above`);
      // Storage account names are global, so one that already exists has to be used where it is.
      const group = (await findStorageAccountGroup(need(), subscriptionId, name, tenantId)) ?? resourceGroupName;
      return { ...exists(await ensureStorageAccount(need(), subscriptionId, group, name, location, tenantId)), output: { group } };
    },
  };
}

// Turned off for now in every part: the access check, permissions and provider-registration steps (restore their imports, inputs and dependsOn with them).
// { key: "access", label: "Check Azure resource access", run: async () => { need(); await checkResourceAccess(); return { status: "completed" }; } },
// {
//   key: "consent",
//   label: "Confirm Microsoft permissions",
//   dependsOn: ["access"],
//   run: async () => {
//     const promptedGraph = await ensureScopeConsent(need(), [...APP_SCOPES], tenantId);
//     return promptedGraph ? { status: "completed" } : { status: "skipped", detail: "Already granted" };
//   },
// },
// {
//   key: "providers",
//   label: "Register required Azure resource providers",
//   dependsOn: ["consent"],
//   run: async () => {
//     const providers = await ensureRegistered(RESOURCE_PROVIDERS);
//     return providers.registered.length === 0 ? { status: "skipped", detail: "Already registered" } : { status: "completed", detail: providers.registered.join(", ") };
//   },
// },

// ─── Terraform state ─────────────────────────────────────────────────────────

type TerraformStateInput = Target & { corpName: string; spClientId: string; resourceGroupName: string; lawName: string; storageAccountName: string };

// The group and workspace share ids with the domain part, so a combined run creates them once.
export function terraformStatePart(input: TerraformStateInput): ProvisionTaskDef[] {
  const { azureAccount, subscriptionId, tenantId, corpName, spClientId, resourceGroupName, lawName, storageAccountName } = input;
  const ready = !!subscriptionId && !!corpName && !!spClientId;
  const need = accountOrThrow(azureAccount, ready, "Sign in to Azure and set the subscription, company code and app registration first");
  return [
    ...groupAndWorkspace(input, need, resourceGroupName, lawName),
    {
      key: "rg-rbac",
      label: "Grant GitHub Actions access to the resource group",
      dependsOn: ["rg"],
      run: async () => {
        const sp = await getExistingSP(need(), spClientId, tenantId);
        if (!sp) throw new Error(`Service principal for app ${spClientId} not found — run the Azure card first`);
        const rgRbac = await ensureRbacRoleAtScope(need(), resourceGroupScope(subscriptionId, resourceGroupName), sp.id, "Reader", tenantId);
        return { ...exists(rgRbac, "Already assigned", "Reader"), output: sp.id };
      },
    },
    {
      key: "diag",
      id: coreTaskIds.subscriptionDiagnostics(subscriptionId, DIAGNOSTIC_SETTING_NAME),
      label: "Configure subscription activity-log diagnostics",
      dependsOn: ["law"],
      run: async ({ output }) => exists(await ensureSubscriptionDiagnostics(need(), subscriptionId, DIAGNOSTIC_SETTING_NAME, output<string>("law"), tenantId), "Already configured"),
    },
    storageAccount(input, need, { key: "storage", resourceKey: "stateStorage", name: storageAccountName, resourceGroupName }),
    {
      key: "container",
      label: `Create ${TFSTATE_CONTAINER} container`,
      dependsOn: ["storage"],
      run: async ({ output }) => exists(await ensureStorageContainer(need(), subscriptionId, groupOf(output, "storage"), storageAccountName, TFSTATE_CONTAINER, tenantId)),
    },
    // CanNotDelete stops deletes only, so the container, diagnostics and role below can still be written after it.
    {
      key: "lock",
      label: "Lock the storage account against deletion",
      dependsOn: ["storage"],
      run: async ({ output }) => {
        const scope = storageAccountScope(subscriptionId, groupOf(output, "storage"), storageAccountName);
        return exists(await ensureDeleteLock(need(), scope, TFSTATE_LOCK_NAME, "Holds Terraform state for every stage.", tenantId), "Already locked", "CanNotDelete");
      },
    },
    // The lock stops neither a write nor a delete of the state itself, so the log is how either is found out.
    {
      key: "blobdiag",
      label: "Send state writes and deletes to the workspace",
      dependsOn: ["storage", "law"],
      lockKeys: [coreTaskIds.blobService(storageAccountName)],
      run: async ({ output }) =>
        exists(
          await ensureBlobDiagnostics(need(), subscriptionId, groupOf(output, "storage"), storageAccountName, DIAGNOSTIC_SETTING_NAME, output<string>("law"), tenantId),
          "Already configured",
          "StorageWrite, StorageDelete"
        ),
    },
    {
      key: "rbac",
      label: "Grant GitHub Actions access to Terraform state",
      dependsOn: ["storage", "rg-rbac"],
      run: async ({ output }) => {
        const scope = storageAccountScope(subscriptionId, groupOf(output, "storage"), storageAccountName);
        return exists(await ensureRbacRoleAtScope(need(), scope, output<string>("rg-rbac"), "Storage Blob Data Contributor", tenantId), "Already assigned", "Storage Blob Data Contributor");
      },
    },
  ];
}

// ─── Domain ───────────────────────────────────────────────────────────────────

type DomainInput = Target & {
  corpName: string;
  dnsName: string;
  resourceGroupName: string;
  lawName: string;
  requestDomainConsent: () => Promise<void>;
  onNameServers: (servers: string[]) => void; // Shown as soon as the zone exists, before the run ends.
};

// A step that finds consent missing asks for it; the page leaves for Microsoft and the run resumes on return.
const consented = (requestConsent: () => Promise<void>, step: (ctx: TaskContext) => Promise<TaskOutcome>) => async (ctx: TaskContext) => {
  try {
    return await step(ctx);
  } catch (err) {
    if (!isConsentError(err instanceof Error ? err.message : "")) throw err;
    await requestConsent().catch(() => {
      throw new Error("Consent redirect failed — try again");
    });
    throw new ConsentRedirectError();
  }
};

// The group and workspace are shared with the Terraform state part, the TXT record waits for zone and domain.
export function domainPart(input: DomainInput): ProvisionTaskDef[] {
  const { azureAccount, subscriptionId, tenantId, corpName, dnsName, resourceGroupName, lawName, requestDomainConsent, onNameServers } = input;
  const need = accountOrThrow(azureAccount, !!subscriptionId && !!corpName && !!dnsName, "Sign in to Azure and set the subscription, company code and domain first");
  return [
    ...groupAndWorkspace(input, need, resourceGroupName, lawName, (step) => consented(requestDomainConsent, step)),
    {
      key: "dns",
      label: `Create DNS zone ${dnsName}`,
      dependsOn: ["rg"],
      run: consented(requestDomainConsent, async () => {
        const zone = await ensureDnsZone(need(), subscriptionId, resourceGroupName, dnsName, tenantId);
        onNameServers(zone.nameServers);
        return { status: zone.result === "exists" ? "skipped" : "completed", detail: zone.nameServers.join(", "), output: zone.nameServers };
      }),
    },
    {
      key: "domain",
      label: "Add custom domain to Entra ID",
      run: consented(requestDomainConsent, async () => {
        const domain = await getEntraDomain(need(), dnsName, tenantId);
        if (domain) return { status: "skipped", detail: domain.isVerified ? "Already added and verified" : "Already added — not yet verified", output: domain.isVerified };
        const created = await createEntraDomain(need(), dnsName, tenantId);
        return { status: "completed", output: created.isVerified };
      }),
    },
    {
      key: "txt",
      label: "Create domain-verification TXT record",
      dependsOn: ["dns", "domain"],
      run: consented(requestDomainConsent, async ({ output }: TaskContext) => {
        if (output<boolean>("domain")) return { status: "skipped", detail: "Domain already verified" };
        const txtToken = await getDomainVerificationTxt(need(), dnsName, tenantId);
        if (!txtToken) throw new Error("No TXT verification record returned by Microsoft Graph");
        const txt = await ensureDnsTxtRecord(need(), subscriptionId, resourceGroupName, dnsName, txtToken, tenantId);
        return { status: txt === "exists" ? "skipped" : "completed", detail: txtToken };
      }),
    },
  ];
}

// ─── Frontend ─────────────────────────────────────────────────────────────────

type FrontendInput = Target & { resourceGroupName: string; lawName: string; webStorageAccountName: string; allowedOrigins: string[] };

// The private group and workspace are shared with the backend, the app registration waits for static hosting.
export function frontendPart(input: FrontendInput): ProvisionTaskDef[] {
  const { azureAccount, subscriptionId, tenantId, resourceGroupName, lawName, webStorageAccountName, allowedOrigins } = input;
  const need = accountOrThrow(azureAccount, !!subscriptionId, "Sign in to Azure and select a subscription first");
  return [
    ...groupAndWorkspace(input, need, resourceGroupName, lawName),
    storageAccount(input, need, { key: "webStorage", resourceKey: "siteStorage", name: webStorageAccountName, resourceGroupName }),
    {
      key: "webBlob",
      label: "Enable static website hosting and reach the blob service",
      dependsOn: ["webStorage"],
      lockKeys: [coreTaskIds.blobService(webStorageAccountName)],
      run: async ({ output }) => {
        await ensureBlobServiceProperties(need(), subscriptionId, groupOf(output, "webStorage"), webStorageAccountName, allowedOrigins, tenantId);
        return { status: "completed", detail: allowedOrigins.join(", ") };
      },
    },
    // Navigates away when consent is missing, so nothing that needs it runs until the user comes back.
    {
      key: "webConsent",
      label: "Consent to the storage data plane",
      run: async () => {
        if (await ensureScopeConsent(need(), [...STORAGE_SCOPES], tenantId)) throw new ConsentRedirectError();
        return { status: "skipped", detail: "Already granted" };
      },
    },
    // Owner does not reach the blob data plane, so the browser needs this to upload the built site.
    {
      key: "webRbac",
      label: "Grant yourself Storage Blob Data Contributor on it",
      dependsOn: ["webStorage", "webConsent"],
      run: async ({ output }) =>
        exists(
          await ensureRbacRoleAtScope(
            need(),
            storageAccountScope(subscriptionId, groupOf(output, "webStorage"), webStorageAccountName),
            need().localAccountId,
            "Storage Blob Data Contributor",
            tenantId,
            "User"
          )
        ),
    },
    // One setting per subscription, shared with the core part, so a combined run writes it once to the core workspace.
    {
      key: "activityLog",
      id: coreTaskIds.subscriptionDiagnostics(subscriptionId, DIAGNOSTIC_SETTING_NAME),
      label: "Send subscription activity to the workspace",
      dependsOn: ["law"],
      run: async ({ output }) => exists(await ensureSubscriptionDiagnostics(need(), subscriptionId, DIAGNOSTIC_SETTING_NAME, output<string>("law"), tenantId)),
    },
    {
      key: "diagnostics",
      label: "Send blob writes to the workspace",
      dependsOn: ["law", "webStorage"],
      lockKeys: [coreTaskIds.blobService(webStorageAccountName)],
      run: async ({ output }) =>
        exists(await ensureBlobDiagnostics(need(), subscriptionId, groupOf(output, "webStorage"), webStorageAccountName, DIAGNOSTIC_SETTING_NAME, output<string>("law"), tenantId)),
    },
    // The redirect uri is the site this card just created, so the app is registered after it.
    {
      key: "installerApp",
      label: `Create app registration ${getPrivateInstallerAppName()}`,
      dependsOn: ["webBlob"],
      run: async () => {
        const siteUrl = await getStaticWebsiteUrl(need(), subscriptionId, webStorageAccountName, tenantId);
        if (!siteUrl) throw new Error("The site's web endpoint is not available yet");
        const existingInstaller = await getExistingApp(need(), getPrivateInstallerAppName(), tenantId);
        const installerApp =
          existingInstaller ?? (await createSpaAppRegistration(need(), getPrivateInstallerAppName(), [siteUrl], PRIVATE_INSTALLER_DELEGATED, tenantId));
        // An app created just now already carries the uri; an older one predates this storage account.
        const addedUri = existingInstaller ? await ensureSpaRedirectUri(need(), existingInstaller.id, siteUrl, tenantId) : false;
        const outcome: TaskOutcome = addedUri ? { status: "completed", detail: `Added redirect URI ${siteUrl}` } : exists(existingInstaller ? "exists" : "created");
        return { ...outcome, output: installerApp.appId };
      },
    },
    // Without a service principal there is no enterprise application to consent to or hold a grant.
    {
      key: "installerSp",
      label: `List ${getPrivateInstallerAppName()} under enterprise applications`,
      dependsOn: ["installerApp"],
      run: async ({ output }) => {
        const appId = output<string>("installerApp");
        const existingInstallerSp = await getExistingSP(need(), appId, tenantId);
        if (!existingInstallerSp) await createServicePrincipal(need(), appId, tenantId);
        return exists(existingInstallerSp ? "exists" : "created");
      },
    },
  ];
}

// ─── Backend ──────────────────────────────────────────────────────────────────

type BackendInput = Target & {
  resourceGroupName: string;
  lawName: string;
  appInsightsName: string;
  storageAccountName: string;
  webPubSubName: string;
  functionAppName: string;
  planName: string;
  pipelineAppName: string;
  allowedOrigins: string[];
  githubAccount: Account | null;
  githubRepo: string;
  githubRepoId: number | null;
  githubEnvName: string | null;
};

// The private group and workspace are shared with the frontend, the Function App waits for storage and Web PubSub.
export function backendPart(input: BackendInput): ProvisionTaskDef[] {
  const { azureAccount, subscriptionId, tenantId, location, resourceGroupName, lawName, appInsightsName, storageAccountName, webPubSubName, functionAppName, planName, pipelineAppName, allowedOrigins } = input;
  const { githubAccount, githubRepo, githubRepoId, githubEnvName } = input;
  const need = accountOrThrow(azureAccount, !!subscriptionId, "Sign in to Azure and select a subscription first");
  return [
    ...groupAndWorkspace(input, need, resourceGroupName, lawName),
    {
      key: "appins",
      label: `Create Application Insights ${appInsightsName}`,
      dependsOn: ["law"],
      run: async ({ output }) => {
        // App Insights wants the workspace's resource id, not its name.
        const created = await ensureAppInsights(need(), subscriptionId, resourceGroupName, appInsightsName, location, output<string>("law"), tenantId);
        const connection = await getAppInsightsConnectionString(need(), subscriptionId, resourceGroupName, appInsightsName, tenantId);
        return { ...exists(created), output: connection };
      },
    },
    storageAccount(input, need, { key: "storage", resourceKey: "storage", name: storageAccountName, resourceGroupName }),
    {
      key: "table",
      label: `Create ${TERMINAL_SESSION_TABLE} table`,
      dependsOn: ["storage"],
      run: async ({ output }) => exists(await ensureStorageTable(need(), subscriptionId, groupOf(output, "storage"), storageAccountName, TERMINAL_SESSION_TABLE, tenantId)),
    },
    {
      key: "container",
      label: `Create ${TERMINAL_DEPLOY_CONTAINER} container`,
      dependsOn: ["storage"],
      run: async ({ output }) => exists(await ensureStorageContainer(need(), subscriptionId, groupOf(output, "storage"), storageAccountName, TERMINAL_DEPLOY_CONTAINER, tenantId)),
    },
    {
      key: "wps",
      label: `Create Web PubSub ${webPubSubName}`,
      dependsOn: ["rg"],
      resourceKey: "webPubSub",
      run: async () => {
        // Its host is global, so one that already exists in this subscription is used where it is.
        const group = (await findWebPubSubGroup(need(), subscriptionId, webPubSubName, tenantId)) ?? resourceGroupName;
        return { ...exists(await ensureWebPubSub(need(), subscriptionId, group, webPubSubName, location, "Free_F1", tenantId)), output: { group } };
      },
    },
    {
      key: "hub",
      label: `Configure hub ${TERMINAL_HUB}`,
      dependsOn: ["wps"],
      run: async ({ output }) => exists(await ensureWebPubSubHub(need(), subscriptionId, groupOf(output, "wps"), webPubSubName, TERMINAL_HUB, tenantId)),
    },
    {
      key: "plan",
      label: "Create Flex Consumption plan",
      dependsOn: ["rg"],
      resourceKey: "functionApp",
      run: async () => {
        // Its host is global, so one that already exists in this subscription keeps its group, plan included.
        const group = (await findFunctionAppGroup(need(), subscriptionId, functionAppName, tenantId)) ?? resourceGroupName;
        return { ...exists(await ensureFlexServicePlan(need(), subscriptionId, group, planName, location, tenantId)), output: { group } };
      },
    },
    {
      key: "app",
      label: `Create Function App ${functionAppName}`,
      dependsOn: ["plan", "storage", "container", "wps"],
      resourceKey: "functionApp",
      run: async ({ output }) => {
        const appGroup = groupOf(output, "plan");
        const blobBase = `https://${storageAccountName}.blob.core.windows.net`;
        const tableBase = `https://${storageAccountName}.table.core.windows.net`;
        const { result: appResult, principalId } = await ensureFlexFunctionApp(
          need(),
          subscriptionId,
          appGroup,
          functionAppName,
          location,
          servicePlanId(subscriptionId, appGroup, planName),
          `${blobBase}/${TERMINAL_DEPLOY_CONTAINER}`,
          {
            APPLICATIONINSIGHTS_AUTHENTICATION_STRING: "Authorization=AAD",
            AzureWebJobsStorage__accountName: storageAccountName,
            AzureWebJobsStorage__credential: "managedidentity",
            AzureWebJobsStorage__blobServiceUri: `${blobBase}/`,
            AzureWebJobsStorage__tableServiceUri: `${tableBase}/`,
            AzureWebJobsStorage__queueServiceUri: `https://${storageAccountName}.queue.core.windows.net/`,
            // The platform's cors block is separate; the backend reads this one itself.
            ALLOWED_ORIGINS: allowedOrigins.join(","),
            WEBPUBSUB_ENDPOINT: `${webPubSubName}.webpubsub.azure.com`,
            HUB_NAME: TERMINAL_HUB,
            SESSION_TABLE_ACCOUNT_NAME: storageAccountName,
            SESSION_TABLE_NAME: TERMINAL_SESSION_TABLE,
          },
          allowedOrigins,
          tenantId
        );
        return { ...exists(appResult), output: principalId };
      },
    },
    {
      key: "rbac",
      label: "Grant the Function App its data-plane roles",
      dependsOn: ["app", "storage", "wps", "appins"],
      run: async ({ output }) => {
        const saScope = storageAccountScope(subscriptionId, groupOf(output, "storage"), storageAccountName);
        const wpsScope = webPubSubScope(subscriptionId, groupOf(output, "wps"), webPubSubName);
        const grants: [string, string][] = [
          [saScope, "Storage Blob Data Contributor"],
          [saScope, "Storage Queue Data Contributor"],
          [saScope, "Storage Table Data Contributor"],
          [wpsScope, "Web PubSub Service Owner"],
          [appInsightsScope(subscriptionId, resourceGroupName, appInsightsName), "Monitoring Metrics Publisher"],
        ];
        const assigned: string[] = [];
        for (const [scope, role] of grants) {
          if ((await ensureRbacRoleAtScope(need(), scope, output<string>("app"), role, tenantId)) === "created") assigned.push(role);
        }
        return assigned.length === 0 ? { status: "skipped", detail: "Already assigned" } : { status: "completed", detail: assigned.join(", ") };
      },
    },
    {
      key: "pipelineApp",
      label: `Create app registration ${pipelineAppName}`,
      run: async () => {
        const existingApp = await getExistingApp(need(), pipelineAppName, tenantId);
        const app = existingApp ?? (await createAppRegistration(need(), pipelineAppName, [], tenantId));
        return { ...exists(existingApp ? "exists" : "created"), output: { id: app.id, appId: app.appId } };
      },
    },
    {
      key: "pipelineSp",
      label: `List ${pipelineAppName} under enterprise applications`,
      dependsOn: ["pipelineApp"],
      run: async ({ output }) => {
        const { appId } = output<{ appId: string }>("pipelineApp");
        const existingSp = await getExistingSP(need(), appId, tenantId);
        const sp = existingSp ?? (await createServicePrincipal(need(), appId, tenantId));
        return { ...exists(existingSp ? "exists" : "created"), output: sp.id };
      },
    },
    {
      key: "pipelineCreds",
      label: `Add GitHub OIDC credential for ${githubEnvName}`,
      dependsOn: ["pipelineApp"],
      run: async ({ output }) => {
        if (!githubAccount || githubRepoId === null || !githubEnvName) throw new Error("Select the GitHub account, repository and environment first");
        const cred = getFederatedCredential(githubAccount.login, githubAccount.id, githubRepo, githubRepoId, githubEnvName);
        const addedCred = await ensureFederatedCredential(need(), output<{ id: string }>("pipelineApp").id, cred.name, cred.subject, tenantId);
        return exists(addedCred ? "created" : "exists");
      },
    },
    // Service Owner, not Service Reader: issuing a client token is a POST on the data plane.
    {
      key: "pipelineRbac",
      label: "Grant it Web PubSub Service Owner",
      dependsOn: ["pipelineSp", "wps"],
      run: async ({ output }) =>
        exists(await ensureRbacRoleAtScope(need(), webPubSubScope(subscriptionId, groupOf(output, "wps"), webPubSubName), output<string>("pipelineSp"), "Web PubSub Service Owner", tenantId)),
    },
  ];
}
