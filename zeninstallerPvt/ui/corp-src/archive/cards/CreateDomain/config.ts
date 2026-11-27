/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ArmRole, CardResourceAccessRequest } from "../../types";
import { APP_SCOPES, DOMAIN_SCOPES, GRANT_CONSENT_SCOPES, readWrite } from "../../config/azureConfig";

export const RESOURCE_PROVIDERS: readonly string[] = ["Microsoft.Network", "Microsoft.OperationalInsights"];
const APP_CONSENT: readonly string[] = [...DOMAIN_SCOPES, ...APP_SCOPES, ...GRANT_CONSENT_SCOPES];
const armRoles = (resourceGroup: string, workspace: string, dnsZone: string): readonly ArmRole[] => [
  {
    scope: { resourceGroup },
    actions: ["Microsoft.Resources/subscriptions/resourceGroups/read"],
  },
  {
    scope: { resourceGroup, resource: `Microsoft.OperationalInsights/workspaces/${workspace}` },
    actions: readWrite("Microsoft.OperationalInsights/workspaces"),
  },
  {
    scope: { resourceGroup, resource: `Microsoft.Network/dnsZones/${dnsZone}` },
    actions: readWrite("Microsoft.Network/dnsZones"),
    children: [
      {
        path: "TXT/@",
        actions: readWrite("Microsoft.Network/dnsZones/TXT"),
      },
    ],
  },
];
const ENTRA_ROLES: readonly string[] = [];

// Azure permissions this card needs to create the DNS zone and its TXT record.
export const createDomainAccess = (resourceGroup: string, workspace: string, dnsZone: string): CardResourceAccessRequest => ({
  resourceProviders: RESOURCE_PROVIDERS,
  appConsent: APP_CONSENT,
  armRoles: armRoles(resourceGroup, workspace, dnsZone),
  entraRoles: ENTRA_ROLES,
});
