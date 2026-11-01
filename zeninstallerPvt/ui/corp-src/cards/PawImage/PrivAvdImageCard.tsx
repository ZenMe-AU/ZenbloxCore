/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import PrivAvdDeployCard, { type PrivAvdDeployCardProps } from "../../components/PrivAvdDeployCard";
import { PRIVAVD_IMAGE_DESCRIPTION, PRIVAVD_IMAGE_RESOURCES, PRIVAVD_IMAGE_TITLE } from "./config";

export default function PrivAvdImageCard(props: PrivAvdDeployCardProps) {
  return (
    <PrivAvdDeployCard
      title={PRIVAVD_IMAGE_TITLE}
      description={PRIVAVD_IMAGE_DESCRIPTION}
      resources={PRIVAVD_IMAGE_RESOURCES}
      {...props}
    />
  );
}
