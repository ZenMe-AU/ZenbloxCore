/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ComponentProps } from "react";
import GaStage from "../GaStage/GaStage";
import { GA_CLOUDFRONT_STAGE } from "./config";

type Props = Omit<ComponentProps<typeof GaStage>, "stageDef">;

export default function GaCloudFront(props: Props) {
  return <GaStage {...props} stageDef={GA_CLOUDFRONT_STAGE} />;
}
