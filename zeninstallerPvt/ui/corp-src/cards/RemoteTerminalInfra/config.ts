/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { APP_SCOPES, readWrite } from "../../config/azureConfig";
import { TERMINAL_DEPLOY_CONTAINER, TERMINAL_HUB, TERMINAL_SESSION_TABLE } from "../../logic/naming";

const ROLE_ASSIGNMENTS = [...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read"];

type Names = { resourceGroup: string; workspace: string; storageAccount: string; appInsights: string; webPubSub: string; functionApp: string; servicePlan: string };

export const RESOURCE_PROVIDERS: readonly string[] = [
  "Microsoft.OperationalInsights",
  "Microsoft.Insights",
  "Microsoft.Storage",
  "Microsoft.SignalRService",
  "Microsoft.Web",
];
const APP_CONSENT: readonly string[] = APP_SCOPES;
const armRoles = (n: Names): readonly ArmRole[] => {
  const { resourceGroup } = n;
  return [
    {
      scope: { resourceGroup },
      actions: ["Microsoft.Resources/subscriptions/resourceGroups/read"],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.OperationalInsights/workspaces/${n.workspace}` },
      actions: readWrite("Microsoft.OperationalInsights/workspaces"),
    },
    {
      scope: { resourceGroup, resource: `Microsoft.Storage/storageAccounts/${n.storageAccount}`, locate: true },
      createActions: ["Microsoft.Storage/checkNameAvailability/read"],
      actions: [...readWrite("Microsoft.Storage/storageAccounts"), ...ROLE_ASSIGNMENTS],
      children: [
        {
          path: `blobServices/default/containers/${TERMINAL_DEPLOY_CONTAINER}`,
          actions: readWrite("Microsoft.Storage/storageAccounts/blobServices/containers"),
        },
        {
          path: `tableServices/default/tables/${TERMINAL_SESSION_TABLE}`,
          actions: readWrite("Microsoft.Storage/storageAccounts/tableServices/tables"),
        },
      ],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.Insights/components/${n.appInsights}` },
      actions: [...readWrite("Microsoft.Insights/components"), ...ROLE_ASSIGNMENTS],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.SignalRService/webPubSub/${n.webPubSub}`, locate: true },
      createActions: ["Microsoft.SignalRService/locations/checkNameAvailability/action"],
      actions: [...readWrite("Microsoft.SignalRService/webPubSub"), ...ROLE_ASSIGNMENTS],
      children: [
        {
          path: `hubs/${TERMINAL_HUB}`,
          actions: readWrite("Microsoft.SignalRService/webPubSub/hubs"),
        },
      ],
    },
    {
      scope: { resourceGroup, resource: `Microsoft.Web/sites/${n.functionApp}`, locate: true },
      createActions: ["Microsoft.Web/checkNameAvailability/read"],
      actions: readWrite("Microsoft.Web/sites"),
    },
    {
      // The card puts the plan in the Function App's group.
      scope: { resourceGroup, resource: `Microsoft.Web/serverfarms/${n.servicePlan}`, locate: `Microsoft.Web/sites/${n.functionApp}` },
      actions: readWrite("Microsoft.Web/serverfarms"),
    },
  ];
};
const ENTRA_ROLES: readonly string[] = [];

// Azure permissions this card needs to create the backend: storage, App Insights, Web PubSub and the Function App with its plan.
export const remoteTerminalInfraAccess = (n: Names): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: armRoles(n),
  entraRoles: ENTRA_ROLES,
});
