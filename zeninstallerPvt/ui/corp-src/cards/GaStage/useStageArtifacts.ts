/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useQuery } from "@tanstack/react-query";
import { fetchLogArtifact, fetchPlan } from "../../api";
import type { Account, PlanItem, PlanSummary, Stage } from "../../types";
import { computePlanSummary } from "../../logic/stage";

type StageArtifactsOptions = {
  account: Account | null;
  repoName: string;
  stage: Stage;
  readingDuringStatusUpdate: boolean;
};

export function useStageArtifacts({
  account,
  repoName,
  stage,
  readingDuringStatusUpdate,
}: StageArtifactsOptions) {
  const readPlanQuery = useQuery({
    queryKey: ["ga-stage", "plan-artifact", account?.login, repoName, stage.planJsonId],
    enabled: !!account && !!repoName && stage.status === "success" && !!stage.planJsonId && !readingDuringStatusUpdate,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<{ items: PlanItem[]; summary: PlanSummary }> => {
      const data = await fetchPlan(stage.planJsonId!, account!, repoName);
      const items: PlanItem[] = data.resource_changes || [];
      return { items, summary: computePlanSummary(items) };
    },
  });

  const readPlanLogQuery = useQuery({
    queryKey: ["ga-stage", "plan-log", account?.login, repoName, stage.planLogId],
    enabled: !!account && !!repoName && stage.status === "failed" && !!stage.planLogId,
    staleTime: Infinity,
    retry: false,
    queryFn: () => fetchLogArtifact(account!, repoName, stage.planLogId!),
  });

  const readDeployLogQuery = useQuery({
    queryKey: ["ga-stage", "deploy-log", account?.login, repoName, stage.deployLogId],
    enabled: !!account && !!repoName && stage.deployStatus === "failed" && !!stage.deployLogId,
    staleTime: Infinity,
    retry: false,
    queryFn: () => fetchLogArtifact(account!, repoName, stage.deployLogId!),
  });

  return {
    readPlan: readPlanQuery.data,
    readPlanPending: readPlanQuery.isPending,
    readPlanError: readPlanQuery.error instanceof Error ? readPlanQuery.error.message : null,
    readPlanLog: readPlanLogQuery.data ?? null,
    readPlanLogPending: readPlanLogQuery.isPending,
    readDeployLog: readDeployLogQuery.data ?? null,
    readDeployLogPending: readDeployLogQuery.isPending,
  };
}
