/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
// import { CORE_INFRA_PROVIDERS, DNS_PROVIDERS, PRIVATE_FRONTEND_PROVIDERS, REMOTE_TERMINAL_PROVIDERS, readWrite } from "../../config/azureConfig";

// const providers = new Set([...CORE_INFRA_PROVIDERS, ...DNS_PROVIDERS, ...PRIVATE_FRONTEND_PROVIDERS, ...REMOTE_TERMINAL_PROVIDERS]);
// Full installer list, kept for reference; resource-level access is now checked by each card on its own resources.
// const SUBSCRIPTION_PERMISSIONS = {
//   resourceGroupsAndProviders: [
//     ...readWrite("Microsoft.Resources/subscriptions/resourceGroups"),
//     "Microsoft.Resources/subscriptions/providers/read",
//     ...Array.from(providers, (provider) => `${provider}/register/action`),
//   ],
//   storage: [
//     ...readWrite(
//       "Microsoft.Storage/storageAccounts",
//       "Microsoft.Storage/storageAccounts/blobServices",
//       "Microsoft.Storage/storageAccounts/blobServices/containers",
//       "Microsoft.Storage/storageAccounts/tableServices/tables"
//     ),
//     "Microsoft.Storage/checkNameAvailability/read",
//   ],
//   monitoring: readWrite(
//     "Microsoft.OperationalInsights/workspaces",
//      "Microsoft.Insights/components",
//      "Microsoft.Insights/diagnosticSettings"
//   ),
//   dns: readWrite(
//     "Microsoft.Network/dnsZones", "Microsoft.Network/dnsZones/TXT", "Microsoft.Network/dnsZones/CNAME"
//   ),
//   functionApps: [
//     ...readWrite("Microsoft.Web/serverfarms", "Microsoft.Web/sites", "Microsoft.Web/sites/config"),
//     "Microsoft.Web/sites/config/list/action", "Microsoft.Web/sites/publish/action", "Microsoft.Web/checkNameAvailability/read",
//   ],
//   webPubSub: [
//     ...readWrite("Microsoft.SignalRService/webPubSub", "Microsoft.SignalRService/webPubSub/hubs"),
//     "Microsoft.SignalRService/locations/checkNameAvailability/action",
//   ],
//   budgets: readWrite("Microsoft.Consumption/budgets"),
//   roleAssignments: [
//     ...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read",
//   ],
//   deletionLocks: readWrite("Microsoft.Authorization/locks"),
// };
//
// // Everything the installer does at subscription scope, checked once when the subscription is picked.
// export const INSTALLER_SUBSCRIPTION_ACTIONS = Object.values(SUBSCRIPTION_PERMISSIONS).flat();

// Subscription-scope actions that belong to other cards, each already checked by that card:
// export const INSTALLER_SUBSCRIPTION_ACTIONS = [
//   ...readWrite("Microsoft.Resources/subscriptions/resourceGroups"), // CoreInfra, CreateDomain, PrivateFrontendInfra, RemoteTerminalInfra
//   "Microsoft.Resources/subscriptions/providers/read", // same four cards
//   ...Array.from(providers, (provider) => `${provider}/register/action`), // same four cards
//   "Microsoft.Storage/checkNameAvailability/read", // CoreInfra, PrivateFrontendInfra, RemoteTerminalInfra
//   "Microsoft.Web/checkNameAvailability/read", // RemoteTerminalInfra
//   "Microsoft.SignalRService/locations/checkNameAvailability/action", // RemoteTerminalInfra
//   ...readWrite("Microsoft.Insights/diagnosticSettings"), // CoreInfra, PrivateFrontendInfra
//   ...readWrite("Microsoft.Consumption/budgets"), "Microsoft.Consumption/budgets/delete", // SubscriptionBudget
//   ...readWrite("Microsoft.Authorization/roleAssignments"), "Microsoft.Authorization/roleDefinitions/read", // AzureAppRegistration, CreateAdminUsers
// ];

const RESOURCE_PROVIDERS: readonly string[] = [];
const APP_CONSENT: readonly string[] = [];
const ARM_ROLES: readonly ArmRole[] = [];
const ENTRA_ROLES: readonly string[] = [];

// This card only lists subscriptions to pick from, so it checks nothing.
export const azureSubscriptionAccess = (): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: ARM_ROLES,
  entraRoles: ENTRA_ROLES,
});
