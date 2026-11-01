/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { PrivAvdResource } from "../../components/PrivAvdDeployCard";

export const PRIVAVD_IMAGE_DIR = "privavd-image";
export const PRIVAVD_IMAGE_TITLE = "PAW golden image";
export const PRIVAVD_IMAGE_DESCRIPTION =
  "Builds the Windows 11 privileged access workstation image with Packer and publishes a new version to the gallery. A build takes about an hour.";

// Each row is a TF_VAR_* variable deployPrivAvd.yml writes into the stage's .env; one not yet on GitHub starts at its default.
export const PRIVAVD_IMAGE_RESOURCES = [
  {
    key: "TF_VAR_IMAGE_VERSION",
    label: "Image version",
    defaultValue: "1.0",
    editable: true,
    hint: "Major.minor — each build appends a timestamp as the patch number",
  },
] as const satisfies readonly PrivAvdResource[];
