/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { PrivAvdResource } from "../../components/PrivAvdDeployCard";

export const PRIVAVD_PAW_DIR = "privavd-paw";
export const PRIVAVD_PAW_TITLE = "PAW Azure Virtual Desktop";
export const PRIVAVD_PAW_DESCRIPTION =
  "Deploys the Azure Virtual Desktop host pool and session host from the newest image version replicated to the region.";

// Each row is a TF_VAR_* variable deployPrivAvd.yml writes into the stage's .env; one not yet on GitHub starts at its default.
export const PRIVAVD_PAW_RESOURCES = [
  { key: "TF_VAR_HOST_POOL_NAME", label: "Host pool", defaultValue: "paw-hostpool" },
  {
    key: "TF_VAR_PAW_GROUP",
    label: "Access group",
    defaultValue: "PrivilegedAccounts",
    editable: true,
    hint: "Existing Entra group whose members can sign in to the PAW",
  },
] as const satisfies readonly PrivAvdResource[];
