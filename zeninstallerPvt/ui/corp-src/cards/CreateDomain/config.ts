/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { CardResourceAccessRequest } from "../../api/azureArm";
import { DNS_PROVIDERS, readWrite } from "../../config/azureConfig";

// Azure permissions this card needs to create the DNS zone and its TXT record.
export const createDomainAccess = (resourceGroup: string, workspace: string, dnsZone: string): CardResourceAccessRequest => ({
  resourceGroup,
  createGroup: { providers: DNS_PROVIDERS },
  resources: [
    { type: "Microsoft.OperationalInsights/workspaces", api: "2022-10-01", name: workspace, actions: readWrite("Microsoft.OperationalInsights/workspaces") },
    {
      type: "Microsoft.Network/dnsZones", api: "2018-05-01", name: dnsZone, actions: readWrite("Microsoft.Network/dnsZones"),
      children: [{ path: "TXT/@", actions: readWrite("Microsoft.Network/dnsZones/TXT") }],
    },
  ],
});
