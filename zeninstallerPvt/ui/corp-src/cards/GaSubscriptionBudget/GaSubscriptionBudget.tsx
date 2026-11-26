/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ComponentProps } from "react";
import GaStage from "../GaStage/GaStage";
import { GA_SUBSCRIPTION_BUDGET_STAGE } from "./config";

type Props = Omit<ComponentProps<typeof GaStage>, "stageDef">;

export default function GaSubscriptionBudget(props: Props) {
  return <GaStage {...props} stageDef={GA_SUBSCRIPTION_BUDGET_STAGE} />;
}
