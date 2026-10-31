/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import PrivAvdDeployCard, { type PrivAvdDeployCardProps } from "../../components/PrivAvdDeployCard";
import { PRIVAVD_PAW_DESCRIPTION, PRIVAVD_PAW_RESOURCES, PRIVAVD_PAW_TITLE } from "./config";

export default function PrivAvdPawCard(props: PrivAvdDeployCardProps) {
  return (
    <PrivAvdDeployCard
      title={PRIVAVD_PAW_TITLE}
      description={PRIVAVD_PAW_DESCRIPTION}
      resources={PRIVAVD_PAW_RESOURCES}
      {...props}
    />
  );
}
