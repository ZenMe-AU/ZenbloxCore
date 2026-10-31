/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import PrivAvdDeployCard, { type PrivAvdDeployCardProps } from "../../components/PrivAvdDeployCard";
import { PRIVAVD_GALLERY_DESCRIPTION, PRIVAVD_GALLERY_RESOURCES, PRIVAVD_GALLERY_TITLE } from "./config";

export default function PrivAvdGalleryCard(props: PrivAvdDeployCardProps) {
  return (
    <PrivAvdDeployCard
      title={PRIVAVD_GALLERY_TITLE}
      description={PRIVAVD_GALLERY_DESCRIPTION}
      resources={PRIVAVD_GALLERY_RESOURCES}
      {...props}
    />
  );
}
