/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { PIPELINE } from "../../logic/pipeline";
import { useCards } from "../../hooks/useCards";
import { useAzureSession, useGithubSession } from "../../session";
import { useDeploymentPlan } from "./useDeploymentPlan";
import { useCorpStageCards } from "./useCorpStageCards";
import StageCard from "./StageCard";

// One card per pipeline stage, all driven by the same deployment plan.
export default function StageCards() {
  const { account: azureAccount } = useAzureSession();
  const { account, repoName, repoEnv, selectedEnv, variables } = useGithubSession();
  const { faces } = useCards();
  const plan = useDeploymentPlan({
    account,
    repoName: repoEnv.repo.selectedRepo?.name ?? null,
    pipeline: PIPELINE,
    selectedEnv,
    branches: repoEnv.repo.branchList,
    branchMatchError: repoEnv.env.branchMatchError,
    envReady: repoEnv.done,
  });
  const stageCards = useCorpStageCards({
    pipeline: PIPELINE,
    plan,
    faces,
    repoDone: repoEnv.done,
    account,
    repoName,
    selectedEnv,
    variableValues: variables.values,
    onVariableConfirmed: variables.onConfirmed,
  });

  return (
    <>
      {stageCards.map(({ key, ...stageCard }) => (
        <StageCard key={key} {...stageCard} azureAccount={azureAccount} />
      ))}
    </>
  );
}
