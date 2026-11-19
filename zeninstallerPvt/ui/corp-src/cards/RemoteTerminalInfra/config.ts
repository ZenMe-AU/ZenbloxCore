/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { REMOTE_TERMINAL_PROVIDERS, readWrite } from "../../config/azureConfig";
import { TERMINAL_DEPLOY_CONTAINER, TERMINAL_HUB, TERMINAL_SESSION_TABLE } from "../../logic/naming";

const ROLE_ASSIGNMENTS = [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"];

type Names = { resourceGroup: string; workspace: string; storageAccount: string; appInsights: string; webPubSub: string; functionApp: string; servicePlan: string };

// Azure permissions this card needs to create the backend: storage, App Insights, Web PubSub and the Function App with its plan.
export const remoteTerminalInfraAccess = (n: Names): CardResourceAccessRequest => ({
  resourceGroup: n.resourceGroup,
  createGroup: { providers: REMOTE_TERMINAL_PROVIDERS },
  resources: [
    { type: "Microsoft.OperationalInsights/workspaces", api: "2022-10-01", name: n.workspace, actions: readWrite("Microsoft.OperationalInsights/workspaces") },
    {
      type: "Microsoft.Storage/storageAccounts", api: "2023-01-01", name: n.storageAccount, locate: true,
      actions: [...readWrite("Microsoft.Storage/storageAccounts"), ...ROLE_ASSIGNMENTS],
      whenCreating: ["Microsoft.Storage/checkNameAvailability/read"],
      children: [
        { path: `blobServices/default/containers/${TERMINAL_DEPLOY_CONTAINER}`, actions: readWrite("Microsoft.Storage/storageAccounts/blobServices/containers") },
        { path: `tableServices/default/tables/${TERMINAL_SESSION_TABLE}`, actions: readWrite("Microsoft.Storage/storageAccounts/tableServices/tables") },
      ],
    },
    { type: "Microsoft.Insights/components", api: "2020-02-02", name: n.appInsights, actions: [...readWrite("Microsoft.Insights/components"), ...ROLE_ASSIGNMENTS] },
    {
      type: "Microsoft.SignalRService/webPubSub", api: "2023-02-01", name: n.webPubSub, locate: true,
      actions: [...readWrite("Microsoft.SignalRService/webPubSub"), ...ROLE_ASSIGNMENTS],
      whenCreating: ["Microsoft.SignalRService/locations/checkNameAvailability/action"],
      children: [{ path: `hubs/${TERMINAL_HUB}`, actions: readWrite("Microsoft.SignalRService/webPubSub/hubs") }],
    },
    {
      type: "Microsoft.Web/sites", api: "2023-12-01", name: n.functionApp, locate: true, actions: readWrite("Microsoft.Web/sites"),
      whenCreating: ["Microsoft.Web/checkNameAvailability/read"],
      alongside: [{ type: "Microsoft.Web/serverfarms", api: "2023-12-01", name: n.servicePlan, actions: readWrite("Microsoft.Web/serverfarms") }],
    },
  ],
});
