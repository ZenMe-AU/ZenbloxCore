/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import { coreInfraAppContextId, useHostingInventory, type HostingInventory, type InventoryField, type UseCoreInfraCard } from "./useCoreInfraCard";
import type { UseTerraformStatePart } from "./useTerraformStatePart";
import AzureAccessCheck from "../../components/AzureAccessCheck";
import CollapsiblePanel from "../../components/CollapsiblePanel";
import Card from "../../components/Card";
import { SelectionRow } from "../../components/ResourceRows";
import { DeploymentDetails, ProvisioningProgress, ResourceGroupList, type ResourceGroupData } from "../../components/ResourceProvisioning";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ErrorText from "../../components/ErrorText";
import { ENTRA_CUSTOM_DOMAINS_URL, getAppRegistrationUrl, getAzureResourceUrl } from "../../logic/consoleUrls";
import { armResourceId, dnsZoneScope, resourceGroupScope, storageAccountScope, webPubSubScope } from "../../api/azureArm";
import { isSettled } from "../../logic/provisioning";
import { getPrivateInstallerAppName } from "../../logic/naming";
import type { UseProvisioning } from "../../hooks/util/useProvisioning";
import { getVariableDisplayName, isDomainName, CORP_NAME_KEYS, TFSTATE_BACKEND_KEYS, DNS_KEYS, CORE_RESOURCE_GROUP_KEYS } from "../../logic/variables";
import CloudVariableDetail from "../CloudVariableDetail";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, AzureAccount, GhEnv } from "../../types";
import type { AppContext } from "../../appContext";
import type { UseDomainPart } from "./useDomainPart";
import type { UseFrontendPart } from "./useFrontendPart";
import type { UseBackendPart } from "./useBackendPart";
import { PrivateConnectionDetails } from "./PrivateFrontendInfraCard";

const CORE_ENVIRONMENT_KEYS = [...CORP_NAME_KEYS, ...DNS_KEYS, ...TFSTATE_BACKEND_KEYS, ...CORE_RESOURCE_GROUP_KEYS];
const CORE_ENVIRONMENT_HIDDEN_KEYS = [...TFSTATE_BACKEND_KEYS, ...CORE_RESOURCE_GROUP_KEYS];

type SectionProps = {
  infra: UseTerraformStatePart;
  createDomain: UseDomainPart;
  frontend: UseFrontendPart;
  backend: UseBackendPart;
  azureAccount: AzureAccount | null;
  corpName: string;
  dnsName: string;
  subscriptionId: string;
  tenantId: string;
  spClientId: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

type Props = Omit<SectionProps, "infra" | "createDomain" | "frontend" | "backend"> & {
  card: CardChrome;
  appCtxStore?: AppContext;
  coreInfra: UseCoreInfraCard;
};

type CoreSectionProps = SectionProps & {
  missing: string[]; // Settings the core group needs before it can run.
};

// Shown while the card is locked; the open card describes it in the core environment's intro.
function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Sets up the core environment for private hosting: Terraform state, your domain, and the private ZenInstaller site with its deployment terminal, all
      created with one button.
    </Typography>
  );
}

function CoreEnvironmentIntro({ containerName }: { containerName: string }) {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Creates the core resource group with Log Analytics, the Terraform state storage and the DNS zone for your domain, then adds the domain to Entra ID.
      Terraform state lives in the{" "}
      <Box component="code" sx={{ typography: "body1" }}>
        {containerName}
      </Box>{" "}container, which GitHub Actions can access to plan and deploy consistently. Alongside it, the private group hosts the private ZenInstaller
      site and its deployment terminal: monitoring, site storage and an Entra app registration for sign-in, then a Function App with a Web PubSub hub that
      streams deployment feedback to the browser, and that always verifies approval with a human before making a change to the environment. You need
      Contributor access (or equivalent such as Owner) on the selected subscription.
    </Typography>
  );
}

function WarningNotice({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25, display: "flex", gap: 1 }}
      role="status"
      aria-live="polite"
    >
      <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
      <Typography color="warning.dark">{children}</Typography>
    </Box>
  );
}

// The whole environment: zbcore-<code>-rg (Terraform state and the corp domain) and zeninstaller-private-rg (frontend hosting and backend).
export function CoreEnvironmentSection({
  infra,
  createDomain,
  frontend,
  backend,
  azureAccount,
  corpName,
  dnsName,
  githubAccount,
  repoName,
  selectedEnv,
  variables,
  githubUrl,
  missing,
}: CoreSectionProps) {
  const { infraRbacStatus, resultMatches, containerName, result } = infra;
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);
  const [settingsToggled, setSettingsToggled] = useState<boolean | null>(null);
  const settingsOpen = settingsToggled ?? !(corpName && dnsName);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const runNonce = infra.runNonce + createDomain.runNonce;
  const prevRunNonceRef = useRef(runNonce);

  // A finished run saves the resource names straight away: stages read them from corp.env, not from here.
  useEffect(() => {
    if (runNonce === prevRunNonceRef.current) return;
    prevRunNonceRef.current = runNonce;
    const t = setTimeout(() => setAutoSaveCounter((c) => c + 1), 0);
    return () => clearTimeout(t);
  }, [runNonce]);

  const populate = {
    ...(result && resultMatches
      ? { TF_STATE_RESOURCE_GROUP: result.stateResourceGroup, TF_STATE_STORAGE_ACCOUNT: result.storageAccountName, TF_STATE_CONTAINER: containerName }
      : {}),
    ...(createDomain.resourcesDone ? { CORE_RESOURCE_GROUP: createDomain.resourceGroupName } : {}),
  };

  // The core group's access waits for the short code and domain its names come from; the private group's doesn't.
  const ready = !!azureAccount && missing.length === 0;
  const parts = [...(ready ? [infra, createDomain] : []), frontend, backend];
  const accessBlocked = parts.filter((part) => part.creationAccess.status === "warning" || part.creationAccess.status === "error");

  // Previously completed for this target, but the live check now shows the resource group is gone or the SP lost access.
  const rgNotFound = resultMatches && infraRbacStatus === "rg-not-found";
  const rgRbacMissing = resultMatches && infraRbacStatus === "missing-role";

  return (
    <Box component="section" aria-label="Core environment" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

      {/* Gating hints */}
      {!azureAccount && (
        <Box role="status" aria-live="polite" sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25 }}>
          <Typography color="warning.dark">Sign in with Azure first — this card reuses that session.</Typography>
        </Box>
      )}
      {azureAccount && missing.length > 0 && (
        <Box role="status" aria-live="polite" sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25 }}>
          <Typography color="warning.dark">
            Missing before setup can run: <b>{missing.join(", ")}</b>
          </Typography>
        </Box>
      )}

      <CollapsiblePanel label="Prerequisites" id="core-environment-settings" open={settingsOpen} onToggle={() => setSettingsToggled(!settingsOpen)} stage>
        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={CORE_ENVIRONMENT_KEYS}
          hiddenKeys={CORE_ENVIRONMENT_HIDDEN_KEYS}
          variables={variables}
          populate={Object.keys(populate).length ? populate : undefined}
          title="Prerequisites"
          keyHints={{
            NAME: (
              <Typography variant="body2" color="text.secondary">
                Used to build Azure resource names, for example acme-law and acmepvt.
              </Typography>
            ),
          }}
          githubUrl={githubUrl}
          autoSaveCounter={autoSaveCounter}
        />
      </CollapsiblePanel>

      {rgNotFound && <WarningNotice>The resource group doesn't exist in the selected subscription anymore — re-run to recreate it.</WarningNotice>}
      {rgRbacMissing && <WarningNotice>GitHub Actions has no access on the resource group — re-run to grant it.</WarningNotice>}
      {createDomain.checkStatusError && <ErrorText>Couldn't check existing setup: {createDomain.checkStatusError}</ErrorText>}

      {/* Whether the domain is already set up shows on its rows in the resource list, not here: saving only saves. */}
      {parts.some((part) => part.creationAccess.status === "error") && (
        <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <ErrorOutlineIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "error.main" }} />
          <Typography color="error.main">Insufficient permissions to continue</Typography>
        </Box>
      )}
      {accessBlocked.length > 0 && (
        <CollapsiblePanel label="Prerequisites" id="core-infra-prerequisites" open={prerequisitesOpen} onToggle={() => setPrerequisitesOpen((open) => !open)}>
          {accessBlocked.map((part) => (
            <AzureAccessCheck key={part.provisioning.id} access={part.creationAccess} resourceAccess errorStyle />
          ))}
        </CollapsiblePanel>
      )}
    </Box>
  );
}

type ResourceGroupsProps = Pick<SectionProps, "infra" | "createDomain" | "frontend" | "backend" | "dnsName" | "subscriptionId" | "tenantId"> & {
  hosting: UseProvisioning;
  coreReady: boolean; // The core names come from the company code and domain, so they wait for those.
  inventory: HostingInventory; // What Azure holds now; wins over this browser's saved results once known.
  variableValues: Record<string, string>; // The app registrations' client ids are saved in the GitHub environment.
};

// Groups by where a resource lives; status comes from this run, then Azure, then (if Azure is unknown) the saved result.
function hostingResourceGroups({ hosting, infra, createDomain, frontend, backend, dnsName, subscriptionId, tenantId, coreReady, inventory, variableValues }: ResourceGroupsProps): ResourceGroupData[] {
  const { plan, state } = hosting;
  const portal = (resourceId: string, blade?: string) => getAzureResourceUrl(tenantId, resourceId, blade);
  const taskId = (stageId: string, key: string) => plan.stages.find((stage) => stage.id === stageId)?.steps.find((step) => step.key === key)?.taskId ?? `${stageId}:${key}`;
  const settled = (stageId: string, key: string) => isSettled(state[taskId(stageId, key)]?.status);
  const output = <T,>(stageId: string, key: string) => (settled(stageId, key) ? (state[taskId(stageId, key)]?.output as T) : undefined);

  // Live answer when Azure gave one, else the saved one.
  const live = <T,>(found: T | undefined, saved: T) => (found === undefined ? saved : found);
  const checking = (field: InventoryField) => (inventory.pending.has(field) ? "Checking Azure" : undefined);

  const coreGroup = infra.resourceGroupName;
  const coreGroupExists = settled("core_infra", "rg") || live(inventory.coreGroup, infra.resultMatches || createDomain.resourcesDone);
  const coreLawExists = settled("core_infra", "law") || live(inventory.coreWorkspace, coreGroupExists);
  const stateStorageGroup =
    output<{ group: string }>("core_infra", "storage")?.group ?? live(inventory.stateStorageGroup, infra.result && infra.resultMatches ? infra.result.stateResourceGroup : null);
  const stateStorageId = stateStorageGroup ? storageAccountScope(subscriptionId, stateStorageGroup, infra.storage.name) : null;
  const stateContainerExists = settled("core_infra", "container") || live(inventory.stateContainer, !!stateStorageId);
  const zoneExists = settled("create_domain", "dns") || live(inventory.dnsZone, createDomain.resourcesDone);
  const domainExists = settled("create_domain", "domain") || live(inventory.customDomain, createDomain.resourcesDone);
  const domainCheck = (field: InventoryField) => (createDomain.checkingStatus ? "Checking whether this domain is already set up" : checking(field));

  const privateGroup = frontend.resourceGroupName;
  const frontendResult = frontend.result && frontend.resultMatches ? frontend.result : null;
  const backendResult = backend.result && backend.resultMatches ? backend.result : null;
  const privateGroupExists = settled("private_frontend_infra", "rg") || live(inventory.privateGroup, !!frontendResult || !!backendResult);
  const privateLawExists = settled("private_frontend_infra", "law") || live(inventory.privateWorkspace, privateGroupExists);
  const siteGroup = output<{ group: string }>("private_frontend_infra", "webStorage")?.group ?? live(inventory.siteStorageGroup, frontendResult?.siteStorageGroup ?? (frontendResult ? privateGroup : null));
  const apiGroup = output<{ group: string }>("remote_terminal_infra", "storage")?.group ?? live(inventory.apiStorageGroup, backendResult?.storageGroup ?? (backendResult ? privateGroup : null));
  const wpsGroup = output<{ group: string }>("remote_terminal_infra", "wps")?.group ?? live(inventory.webPubSubGroup, backendResult?.webPubSubGroup ?? (backendResult ? privateGroup : null));
  const appGroup = output<{ group: string }>("remote_terminal_infra", "plan")?.group ?? live(inventory.functionAppGroup, backendResult?.functionAppGroup ?? (backendResult ? privateGroup : null));
  const installerClientId = output<string>("private_frontend_infra", "installerApp") ?? frontendResult?.installerClientId ?? (variableValues.VITE_AZURE_CLIENT_ID || undefined);
  const pipelineClientId = output<{ appId: string }>("remote_terminal_infra", "pipelineApp")?.appId ?? backendResult?.pipelineClientId ?? (variableValues.WEBPUBSUB_CLIENT_ID || undefined);
  const appInsightsExists = settled("remote_terminal_infra", "appins") || live(inventory.appInsights, !!backendResult);

  return [
    {
      id: "core",
      name: coreGroup,
      href: coreReady && coreGroupExists ? portal(resourceGroupScope(subscriptionId, coreGroup)) : null,
      note: coreReady ? undefined : "Waits for the company code and domain",
      rows: coreReady
        ? [
            {
              key: "coreLaw",
              type: "Log Analytics",
              name: infra.lawName,
              taskIds: [taskId("core_infra", "law")],
              exists: coreLawExists,
              checking: checking("coreWorkspace"),
              href: coreLawExists ? portal(armResourceId(subscriptionId, coreGroup, "Microsoft.OperationalInsights/workspaces", infra.lawName)) : null,
            },
            {
              key: "stateStorage",
              type: "Storage account",
              name: infra.storage.name,
              taskIds: [taskId("core_infra", "storage")],
              exists: !!stateStorageId,
              checking: checking("stateStorageGroup"),
              href: stateStorageId && portal(stateStorageId),
              // Global to Azure, so it has to be changeable when another tenant already holds it.
              edit: infra.storage,
            },
            {
              key: "stateContainer",
              type: "State container",
              name: infra.containerName,
              taskIds: [taskId("core_infra", "container")],
              exists: stateContainerExists,
              checking: checking("stateContainer"),
              href: stateContainerExists && stateStorageId ? portal(stateStorageId, "containersList") : null,
            },
            {
              key: "dnsZone",
              type: "DNS zone",
              name: dnsName,
              taskIds: [taskId("create_domain", "dns")],
              exists: zoneExists,
              checking: domainCheck("dnsZone"),
              // The name servers stay in the deployment details.
              plainStatus: true,
              href: zoneExists ? portal(dnsZoneScope(subscriptionId, coreGroup, dnsName)) : null,
            },
          ]
        : [],
    },
    {
      id: "private",
      name: privateGroup,
      href: privateGroupExists ? portal(resourceGroupScope(subscriptionId, privateGroup)) : null,
      rows: [
        {
          key: "privateLaw",
          type: "Log Analytics",
          name: frontend.lawName,
          taskIds: [taskId("private_frontend_infra", "law")],
          exists: privateLawExists,
          checking: checking("privateWorkspace"),
          href: privateLawExists ? portal(armResourceId(subscriptionId, privateGroup, "Microsoft.OperationalInsights/workspaces", frontend.lawName)) : null,
        },
        {
          key: "appInsights",
          type: "Application Insights",
          name: backend.appInsightsName,
          taskIds: [taskId("remote_terminal_infra", "appins")],
          exists: appInsightsExists,
          checking: checking("appInsights"),
          href: appInsightsExists ? portal(armResourceId(subscriptionId, privateGroup, "Microsoft.Insights/components", backend.appInsightsName)) : null,
        },
        // These names are global to Azure, so they have to be changeable when another tenant already holds one.
        {
          key: "siteStorage",
          type: "Site storage account",
          name: frontend.siteStorage.name,
          taskIds: [taskId("private_frontend_infra", "webStorage")],
          exists: !!siteGroup,
          checking: checking("siteStorageGroup"),
          href: siteGroup && portal(storageAccountScope(subscriptionId, siteGroup, frontend.siteStorage.name)),
          edit: frontend.siteStorage,
        },
        {
          key: "storage",
          type: "API storage account",
          name: backend.storage.name,
          taskIds: [taskId("remote_terminal_infra", "storage")],
          exists: !!apiGroup,
          checking: checking("apiStorageGroup"),
          href: apiGroup && portal(storageAccountScope(subscriptionId, apiGroup, backend.storage.name)),
          edit: backend.storage,
        },
        {
          key: "webPubSub",
          type: "Web PubSub",
          name: backend.webPubSub.name,
          taskIds: [taskId("remote_terminal_infra", "wps")],
          exists: !!wpsGroup,
          checking: checking("webPubSubGroup"),
          href: wpsGroup && portal(webPubSubScope(subscriptionId, wpsGroup, backend.webPubSub.name)),
          edit: backend.webPubSub,
        },
        {
          key: "functionApp",
          type: "Function App",
          name: backend.functionApp.name,
          taskIds: [taskId("remote_terminal_infra", "plan"), taskId("remote_terminal_infra", "app")],
          exists: !!appGroup,
          checking: checking("functionAppGroup"),
          href: appGroup && portal(armResourceId(subscriptionId, appGroup, "Microsoft.Web/sites", backend.functionApp.name)),
          edit: backend.functionApp,
        },
      ],
    },
    {
      id: "entra",
      name: "Microsoft Entra ID",
      rows: [
        ...(coreReady
          ? [
              {
                key: "customDomain",
                type: "Custom domain",
                name: dnsName,
                taskIds: [taskId("create_domain", "domain")],
                exists: domainExists,
                checking: domainCheck("customDomain"),
                href: domainExists ? ENTRA_CUSTOM_DOMAINS_URL : null,
              },
            ]
          : []),
        {
          key: "installerApp",
          type: "Sign-in app registration",
          name: getPrivateInstallerAppName(),
          taskIds: [taskId("private_frontend_infra", "installerApp"), taskId("private_frontend_infra", "installerSp")],
          exists: !!installerClientId,
          href: installerClientId && getAppRegistrationUrl(installerClientId),
        },
        {
          key: "pipelineApp",
          type: "Web PubSub app registration",
          name: backend.pipelineAppName,
          taskIds: [taskId("remote_terminal_infra", "pipelineApp"), taskId("remote_terminal_infra", "pipelineSp")],
          exists: !!pipelineClientId,
          href: pipelineClientId && getAppRegistrationUrl(pipelineClientId),
        },
      ],
    },
  ];
}

export default function CoreInfraCard({ card, appCtxStore, coreInfra, ...rest }: Props) {
  const { infra, createDomain, frontend, backend, provisioning: hosting } = coreInfra;
  const sectionProps = { ...rest, infra, createDomain, frontend, backend };
  const { azureAccount, corpName, dnsName, subscriptionId, tenantId, spClientId, githubAccount, repoName, selectedEnv, variables, githubUrl } = rest;
  const { location, locations, locationsLoading, locationsError } = coreInfra;
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  // Bumped by Start over, so Azure is asked again what the last run left behind.
  const [lookupRound, setLookupRound] = useState(0);
  const parts = [infra, createDomain, frontend, backend];

  const missing: string[] = [];
  if (!corpName) missing.push(getVariableDisplayName("NAME"));
  if (!dnsName) missing.push(getVariableDisplayName("DNS"));
  else if (!isDomainName(dnsName)) missing.push(`a valid ${getVariableDisplayName("DNS")}`);
  if (!subscriptionId) missing.push("AZURE_SUBSCRIPTION_ID");
  if (!spClientId) missing.push("AZURE_CLIENT_ID");
  if (backend.runProblem?.id === "github") missing.push("GitHub repository and environment");
  const coreReady = !!azureAccount && !!corpName && !!dnsName;
  const { running, started } = hosting;
  const created = infra.resultMatches && createDomain.resourcesDone && [frontend, backend].every((part) => part.result && part.resultMatches);
  const nameProblem = backend.runProblem?.id === "name" ? backend.runProblem.detail : null;
  const canRun =
    !!azureAccount && missing.length === 0 && !nameProblem && !!location.trim() && !editingLocation && !editingName && parts.every((part) => part.creationAccess.status === "ready");

  const inventory = useHostingInventory(
    { azureAccount, subscriptionId, tenantId },
    {
      coreGroup: coreReady ? infra.resourceGroupName : "",
      coreWorkspace: coreReady ? infra.lawName : "",
      stateStorage: coreReady ? infra.storage.name : "",
      stateContainer: infra.containerName,
      dnsName: coreReady && isDomainName(dnsName) ? dnsName : "",
      privateGroup: frontend.resourceGroupName,
      privateWorkspace: frontend.lawName,
      appInsights: backend.appInsightsName,
      siteStorage: frontend.siteStorage.name,
      apiStorage: backend.storage.name,
      webPubSub: backend.webPubSub.name,
      functionApp: backend.functionApp.name,
    },
    lookupRound
  );
  const groups = hostingResourceGroups({ hosting, infra, createDomain, frontend, backend, dnsName, subscriptionId, tenantId, coreReady, inventory, variableValues: variables.values });
  const rowOfTask = (taskId: string) => groups.flatMap((group) => group.rows).find((row) => row.taskIds.includes(taskId))?.key;

  useEffect(() => {
    if (!appCtxStore) return;
    const currentBaseCardStatus = card.locked
      ? "blocked"
      : coreInfra.status === "loading"
        ? "loading"
        : coreInfra.status === "error"
          ? "error"
          : coreInfra.done
            ? "complete"
            : "ready";
    appCtxStore.update(coreInfraAppContextId, {
      title: "Private hosting environment",
      currentBaseCardStatus,
      currentStatus: coreInfra.status,
    });
  }, [appCtxStore, card.locked, coreInfra.done, coreInfra.status]);

  return (
    <Card title="Private hosting environment" lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Intro />
        <CoreEnvironmentSection {...sectionProps} missing={missing} />

        {/* The button and the one setting it needs come first; the resources and steps below are for reference. */}
        <Box component="section" aria-label="Create" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Button variant="contained" onClick={() => void coreInfra.run()} disabled={running || !canRun}>
              {coreInfra.done ? "Re-run" : "Create private hosting environment"}
            </Button>
            {/* One region for both groups: every part creates its resources there. Fixed once a run has created something. */}
            {started ? (
              <Typography color="text.muted">Location: {locations.find((region) => region.name === location)?.displayName ?? location}</Typography>
            ) : (
              <SelectionRow
                id="core-infra-location"
                label="Location"
                name="Azure region"
                value={location}
                onChange={coreInfra.setLocation}
                options={locations.map((region) => ({ value: region.name, label: region.displayName }))}
                error={locationsError ? "Couldn't load Azure region list — type the region name manually." : null}
                loading={locationsLoading}
                placeholder="e.g. australiaeast"
                editing={editingLocation}
                setEditing={setEditingLocation}
              />
            )}
            {started && !running && (
              <Button
                size="small"
                onClick={() => {
                  coreInfra.reset();
                  setLookupRound((round) => round + 1);
                }}
                sx={{ color: "text.muted", "&:hover": { color: "primary.main" } }}
              >
                ↩ Start over
              </Button>
            )}
          </Box>
          {nameProblem && <WarningNotice>{nameProblem}</WarningNotice>}
          <ProvisioningProgress provisioning={hosting} rowOfTask={rowOfTask} />
        </Box>

        <ResourceGroupList
          title={created ? "Resources" : "Resources to be created"}
          groups={groups}
          provisioning={hosting}
          // An open name is a draft: nothing runs until it is confirmed or undone.
          editing={editingName}
          onEditingChange={setEditingName}
        />

        {started && <DeploymentDetails provisioning={hosting} footer={<ProcessRetryNotice started={started} />} />}

        <PrivateConnectionDetails
          frontend={frontend}
          backend={backend}
          githubAccount={githubAccount}
          repoName={repoName}
          selectedEnv={selectedEnv}
          variables={variables}
          githubUrl={githubUrl}
        />
      </Box>
    </Card>
  );
}
