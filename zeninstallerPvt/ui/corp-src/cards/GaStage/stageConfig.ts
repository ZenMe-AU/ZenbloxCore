/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ActionType, ArmRole, CardResourceAccessRequest } from "./types";
import { readWrite } from "../../config/azureConfig";
// import { PRIVATE_RESOURCE_GROUP } from "../../logic/naming"; // Deprecated: the terminal backend now only needs a sign-in to its tenant; kept for reference.

// // The remote terminal's storage account (session table) and Web PubSub, from the Remote terminal card.
// export type TerminalNames = { storageAccount: string; webPubSub: string }; // Deprecated: the terminal backend now only needs a sign-in to its tenant; kept for reference.

const STAGE_RESOURCE_PROVIDERS: Readonly<Record<string, readonly string[]>> = {
  SubscriptionBudget: ["Microsoft.Consumption"],
  CloudFront: ["Microsoft.Network"],
};
// What must be registered before a stage can plan; the Stage card offers to register what is missing.
export const stageProviders = (dir: string): readonly string[] => STAGE_RESOURCE_PROVIDERS[dir] ?? [];
const APP_CONSENT: readonly string[] = [];
// // Every deploy runs in the remote terminal, whose backend requires these of the caller.
// const terminalArmRoles = (n: TerminalNames): readonly ArmRole[] => [ // Deprecated: the terminal backend now only needs a sign-in to its tenant; kept for reference.
//   {
//     scope: { resourceGroup: PRIVATE_RESOURCE_GROUP, resource: `Microsoft.Storage/storageAccounts/${n.storageAccount}`, locate: true, mustExist: true },
//     actions: [],
//     dataActions: [
//       ...readWrite("Microsoft.Storage/storageAccounts/tableServices/tables/entities"),
//       "Microsoft.Storage/storageAccounts/tableServices/tables/entities/delete",
//       "Microsoft.Storage/storageAccounts/tableServices/tables/entities/add/action",
//       "Microsoft.Storage/storageAccounts/tableServices/tables/entities/update/action",
//     ],
//   },
//   {
//     scope: { resourceGroup: PRIVATE_RESOURCE_GROUP, resource: `Microsoft.SignalRService/webPubSub/${n.webPubSub}`, locate: true, mustExist: true },
//     actions: [],
//     dataActions: ["Microsoft.SignalRService/WebPubSub/*"],
//   },
// ];
const STAGE_ARM_ROLES: Readonly<Record<string, readonly ArmRole[]>> = {
  SubscriptionBudget: [
    {
      scope: "subscription",
      actions: [...readWrite("Microsoft.Consumption/budgets"), "Microsoft.Consumption/budgets/delete"],
    },
  ],
};
const STAGE_ENTRA_ROLES: Readonly<Record<string, readonly string[]>> = {};

export const stageAccess = (dir: string): CardResourceAccessRequest => ({
  resourceProviders: stageProviders(dir),
  appConsent: APP_CONSENT,
  // armRoles: [...(STAGE_ARM_ROLES[dir] ?? []), ...terminalArmRoles(terminal)], // Deprecated: the terminal backend now only needs a sign-in to its tenant; kept for reference.
  armRoles: STAGE_ARM_ROLES[dir] ?? [],
  entraRoles: STAGE_ENTRA_ROLES[dir] ?? [],
});

// Terraform state, from the Core infra card.
export type TfStateNames = { resourceGroup: string; storageAccount: string };

// What the plan app (AZURE_PLAN_CLIENT_ID) needs to plan any stage, checked by its service principal's object id: read everything, and read the Terraform state blobs.
export const planAppAccess = (objectId: string, tfState: TfStateNames): CardResourceAccessRequest => ({
  resourceProviders: [],
  appConsent: [],
  armRoles: [
    { scope: "subscription", objectId, actions: ["*/read"] },
    {
      scope: { resourceGroup: tfState.resourceGroup, resource: `Microsoft.Storage/storageAccounts/${tfState.storageAccount}`, mustExist: true },
      objectId,
      actions: [],
      dataActions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"],
    },
  ],
  entraRoles: [],
});

export const ACTION_CONFIG: Record<ActionType, { symbol: string; color: string }> = {
  create: { symbol: "+", color: "success.main" },
  delete: { symbol: "-", color: "error.main" },
  update: { symbol: "~", color: "warning.main" },
  replace: { symbol: "+/-", color: "info.main" },
  noOp: { symbol: "=", color: "text.muted" },
  unknown: { symbol: "?", color: "text.muted" },
};
