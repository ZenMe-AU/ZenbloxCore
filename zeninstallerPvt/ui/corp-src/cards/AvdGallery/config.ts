/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DEFAULT_AZURE_LOCATION } from "../../logic/naming";
import type { PrivAvdResource } from "../../components/PrivAvdDeployCard";

export const PRIVAVD_GALLERY_DIR = "privavd-gallery";
export const PRIVAVD_GALLERY_TITLE = "PAW image gallery";
export const PRIVAVD_GALLERY_DESCRIPTION =
  "Creates the Azure Compute Gallery and the image definition the privileged access workstation image is published to.";

// Each row is a TF_VAR_* variable deployPrivAvd.yml writes into the stage's .env; one not yet on GitHub starts at its default.
export const PRIVAVD_GALLERY_RESOURCES = [
  { key: "TF_VAR_GALLERY_RG", label: "Compute gallery", defaultValue: "paw_gallery" },
  { key: "TF_VAR_IMAGE_NAME", label: "Image definition", defaultValue: "PrivilegedWorkstation" },
  { key: "TF_VAR_IMAGE_PUBLISHER", label: "Publisher", defaultValue: "Zenblox" },
  { key: "TF_VAR_IMAGE_OFFER", label: "Offer", defaultValue: "PrivilegedWorkstation" },
  { key: "TF_VAR_IMAGE_SKU", label: "SKU", defaultValue: "paw-win11-tl" },
  { key: "TF_VAR_PAW_LOCATION", label: "Location", defaultValue: DEFAULT_AZURE_LOCATION, editable: true, hint: "Azure region for every PAW resource, e.g. australiaeast" },
] as const satisfies readonly PrivAvdResource[];
