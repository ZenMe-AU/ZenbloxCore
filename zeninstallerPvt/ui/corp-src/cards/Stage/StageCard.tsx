/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Tooltip, Typography } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import BlockIcon from "@mui/icons-material/Block";
import type {
  Account,
  AzureAccount,
  CardChrome,
  CardId,
  CardStatus,
  GhEnv,
  PlanItem,
  PlanSummary,
  Prerequisite,
  PrerequisiteStageVar,
  Stage,
  StageDefinition,
} from "../../types";
import { createVariable, fetchLogArtifact, fetchPlan, updateVariable } from "../../api";
import { useAzurePermissions } from "../../hooks/util/useAzurePermissions";
import { useRemoteTerminal } from "./useRemoteTerminal";
import { PIPELINE } from "../../logic/pipeline";
import { computePlanSummary, isPlanBehind } from "../../logic/stage";
import { getVariableDisplayName } from "../../logic/variables";
import ViewLink from "../../components/ViewLink";
import { getWorkflowRunUrl } from "../../logic/github";
import { MONO_FONT } from "../../config/styles";
import Card from "../../components/Card";
import VariablesCard from "../../components/VariablesCard";
import ErrorText from "../../components/ErrorText";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import StatusText from "../../components/StatusText";
import StagePlanDetail from "./StagePlanDetail";
import RemoteTerminal from "./RemoteTerminal";

function checkPrerequisite(prereq: Prerequisite, cardStatus: Record<CardId, CardStatus>, variableValues: Record<string, string>): boolean {
  switch (prereq.type) {
    case "card":
      return cardStatus[prereq.cardId] === "complete";
    case "var":
      return !!variableValues[prereq.key]?.trim();
    case "varGroup":
    case "stageVar":
      return prereq.keys.every((k) => !!variableValues[k]?.trim());
  }
}

function prereqLabel(prereq: Prerequisite, variableValues: Record<string, string>): string {
  switch (prereq.type) {
    case "card":
      return prereq.cardId;
    case "var": {
      const label = getVariableDisplayName(prereq.key);
      const val = variableValues[prereq.key]?.trim();
      return val ? `${label}: ${val}` : `${label} not set`;
    }
    case "varGroup":
      return prereq.label;
    case "stageVar": {
      const setCount = prereq.keys.filter((k) => !!variableValues[k]?.trim()).length;
      return setCount === prereq.keys.length ? `${prereq.label} configured` : `${prereq.label} (${setCount}/${prereq.keys.length} set)`;
    }
  }
}

function StageVarEditor({
  prereq,
  savedValues,
  deployedValues,
  account,
  repo,
  selectedEnv,
  onVariableConfirmed,
}: {
  prereq: PrerequisiteStageVar;
  savedValues: Record<string, string>;
  deployedValues?: Record<string, string>;
  account: Account | null;
  repo: string;
  selectedEnv: GhEnv | null;
  onVariableConfirmed: (key: string, value: string) => void;
}) {
  const [localValues, setLocalValues] = useState<Record<string, string>>(savedValues);
  const [upsertStatuses, setUpsertStatuses] = useState<{ key: string; status: "success" | "error"; error?: string }[]>([]);
  const [updating, setUpdating] = useState(false);
  const [prevSaved, setPrevSaved] = useState(savedValues);
  if (prevSaved !== savedValues) {
    setPrevSaved(savedValues);
    setLocalValues(savedValues);
    setUpsertStatuses([]);
  }

  const dirtyKeys = prereq.keys.filter((k) => (localValues[k] ?? "") !== (savedValues[k] ?? ""));
  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };
  const handleRevert = (key: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: savedValues[key] ?? "" }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };
  const handleUpdate = async () => {
    if (!account || !repo || !selectedEnv || dirtyKeys.length === 0) return;
    setUpdating(true);
    const statuses: { key: string; status: "success" | "error"; error?: string }[] = [];
    for (const key of dirtyKeys) {
      const value = localValues[key] ?? "";
      const isNew = !savedValues[key];
      try {
        await (isNew ? createVariable : updateVariable)(account, repo, key, value, selectedEnv.name);
        statuses.push({ key, status: "success" });
        onVariableConfirmed(key, value);
      } catch (e) {
        console.error(`Failed to ${isNew ? "create" : "update"} variable "${key}":`, e);
        statuses.push({ key, status: "error", error: "Update failed" });
      }
    }
    setUpsertStatuses(statuses);
    setUpdating(false);
  };

  return (
    <Box sx={{ mt: 0.75 }}>
      <VariablesCard
        requiredKeys={prereq.keys}
        savedValues={savedValues}
        localValues={localValues}
        upsertStatuses={upsertStatuses}
        descriptions={prereq.descriptions}
        deployedValues={deployedValues}
        onChange={handleChange}
        onRevert={handleRevert}
      />
      <Box sx={{ mt: 1.5 }}>
        <Button
          onClick={handleUpdate}
          disabled={updating || dirtyKeys.length === 0 || !selectedEnv}
          variant="contained"
          size="small"
        >
          {updating ? "Updating..." : dirtyKeys.length > 0 ? `Update ${dirtyKeys.length} variable${dirtyKeys.length !== 1 ? "s" : ""}` : "Update variables"}
        </Button>
      </Box>
    </Box>
  );
}

// Shared by the plan and deploy failures — both publish the same kind of single-file log artifact.
export function FailureLog({ fetched, text }: { fetched: boolean; text: string | null }) {
  if (!fetched) return <StatusText>Loading log...</StatusText>;
  if (!text) return null;
  return (
    <Box
      sx={{
        mt: 0.5,
        p: 1.25,
        borderRadius: "6px",
        backgroundColor: "background.default",
        border: "1px solid",
        borderColor: "error.light",
        maxHeight: "10rem",
        overflowY: "auto",
      }}
      role="alert"
      aria-live="assertive"
    >
      <Typography component="pre" color="error.dark" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all", m: 0, ...MONO_FONT }}>
        {text}
      </Typography>
    </Box>
  );
}

function relativeTime(unixSeconds: number): string {
  const diff = Date.now() - unixSeconds * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RunStatusUpdateButton({
  onRun,
  running,
  countdown,
  disabled,
}: {
  onRun: () => Promise<void>;
  running: boolean;
  countdown: number;
  disabled: boolean;
}) {
  return (
    <Button
      onClick={() => void onRun()}
      disabled={disabled}
      variant="outlined"
      size="small"
      aria-busy={running}
      startIcon={running ? undefined : <PlayArrowIcon sx={{ typography: "body2" }} />}
      sx={{
        alignSelf: "flex-start",
        borderColor: "primary.light",
        color: "primary.dark",
        py: 0.55,
        px: 1.5,
        "&:hover": { borderColor: "primary.main", backgroundColor: "action.hover" },
        "&.Mui-disabled": { borderColor: "divider", color: "text.disabled" },
      }}
    >
      {running ? (
        <>
          <CircularProgress aria-label="Updating plan status" size={12} sx={{ mr: 1 }} />
          Running... {countdown >= 60 ? `${Math.ceil(countdown / 60)}m` : `${countdown}s`}
        </>
      ) : (
        "Get Updated Plan"
      )}
    </Button>
  );
}

type Props = {
  card: CardChrome;
  stageDef: StageDefinition;
  stage: Stage;
  latestSha?: string;
  deployDisabled: boolean;
  deployedEnv: Record<string, string> | null;
  variableValues: Record<string, string>;
  cardStatus: Record<CardId, CardStatus>;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  onVariableConfirmed: (key: string, value: string) => void;
  trackDeploy?: () => Promise<void>;
  onPlanSummary: (s: PlanSummary) => void;
  onRunStatusUpdate: () => Promise<void>;
  statusUpdateRunning: boolean;
  statusUpdateCountdown: number;
  statusUpdateDisabled: boolean;
  runError: string | null;
  azureAccount: AzureAccount | null;
};

function Action({ repoFullName, runId }: { repoFullName: string | null; runId?: string }) {
  if (!repoFullName || !runId) return null;
  return <ViewLink href={getWorkflowRunUrl(repoFullName, runId)} label="Open plan run in GitHub" />;
}

export default function StageCard({
  card,
  stageDef,
  stage,
  latestSha,
  deployDisabled,
  deployedEnv,
  variableValues,
  cardStatus,
  account,
  repoName,
  selectedEnv,
  onVariableConfirmed,
  trackDeploy,
  onPlanSummary,
  onRunStatusUpdate,
  statusUpdateRunning,
  statusUpdateCountdown,
  statusUpdateDisabled,
  runError,
  azureAccount,
}: Props) {
  const [expandedPrereqs, setExpandedPrereqs] = useState<Record<number, boolean>>({});
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [planSummary, setPlanSummary] = useState<PlanSummary>({ create: 0, update: 0, delete: 0, replace: 0 });
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [deployLog, setDeployLog] = useState<{ id: number; text: string | null } | null>(null);
  const [planLog, setPlanLog] = useState<{ id: number; text: string | null } | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [deployStarted, setDeployStarted] = useState(false);

  // One instance per card. The permissions come straight from this stage's definition, so there
  // is no shared pending flag to leak and no union of every stage's permissions to over-grant.
  const azurePermissions = useAzurePermissions({
    azureAccount,
    spClientId: variableValues.AZURE_CLIENT_ID ?? "",
    tenantId: variableValues.AZURE_TENANT_ID || undefined,
    permissions: stageDef.azurePermissions,
  });
  const remoteTerminal = useRemoteTerminal({
    account,
    repoName,
    workflowId: PIPELINE.deployWorkflowId,
    dir: stageDef.dir,
    planRunId: stage.runId,
    selectedEnv,
  });
  // Deploying is both halves: the terminal dispatches the run and carries the sign-in, then
  // trackDeploy starts polling for the report it will eventually record.
  const onDeploy =
    trackDeploy &&
    (async () => {
      if (await remoteTerminal.start()) {
        setDeployStarted(true);
        await trackDeploy();
      }
    });

  const onPlanSummaryRef = useRef(onPlanSummary);
  useLayoutEffect(() => {
    onPlanSummaryRef.current = onPlanSummary;
  });

  const prevRepoName = useRef(repoName);
  const lastPlanFetchKey = useRef<string | null>(null);
  useEffect(() => {
    if (!stage.planJsonId || stage.status !== "success" || !account) {
      prevRepoName.current = repoName;
      return;
    }
    if (repoName !== prevRepoName.current) return;
    const key = `${account.id}_${repoName}_${stage.planJsonId}`;
    if (key === lastPlanFetchKey.current) return;
    lastPlanFetchKey.current = key;
    prevRepoName.current = repoName;
    const t = setTimeout(() => setPlanLoading(true), 0);
    fetchPlan(stage.planJsonId, account, repoName)
      .then((data) => {
        const fetched: PlanItem[] = data.resource_changes || [];
        const s = computePlanSummary(fetched);
        setPlanItems(fetched);
        setPlanSummary(s);
        setPlanError(null);
        onPlanSummaryRef.current?.(s);
      })
      .catch((err: Error) => setPlanError(err.message))
      .finally(() => {
        clearTimeout(t);
        setPlanLoading(false);
      });
    return () => clearTimeout(t);
  }, [stage.planJsonId, stage.status, account, repoName]);

  useEffect(() => {
    const id = stage.deployLogId;
    if (stage.deployStatus !== "failed" || !id || !account) return;
    fetchLogArtifact(account, repoName, id)
      .then((text) => setDeployLog({ id, text }))
      .catch(console.error);
  }, [stage.deployLogId, stage.deployStatus, account, repoName]);

  useEffect(() => {
    const id = stage.planLogId;
    if (stage.status !== "failed" || !id || !account) return;
    fetchLogArtifact(account, repoName, id)
      .then((text) => setPlanLog({ id, text }))
      .catch(console.error);
  }, [stage.planLogId, stage.status, account, repoName]);

  const deployLogFetched = !!stage.deployLogId && deployLog?.id === stage.deployLogId;
  const planLogFetched = !!stage.planLogId && planLog?.id === stage.planLogId;

  // Make sure the pipeline's service principal can do what the run needs before triggering it.
  const handleRunStatusUpdate = async () => {
    setPermissionError(null);
    try {
      await azurePermissions.ensure();
    } catch (e) {
      console.error("Failed to grant Graph permissions:", e);
      setPermissionError(e instanceof Error ? e.message : "Failed to grant the pipeline's Graph permissions");
      return;
    }
    await onRunStatusUpdate();
  };
  const hasDetails = stage.status === "success" && !!stage.planJsonId && stage.planJsonUrl !== "";

  const repoFullName = account && repoName ? `${account.login}/${repoName}` : null;

  const intro = stageDef.description ? (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      {stageDef.description}
    </Typography>
  ) : undefined;

  return (
    <Card title={stageDef.label} action={<Action repoFullName={repoFullName} runId={stage.runId} />} lockedIntro={intro} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {intro}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <RunStatusUpdateButton
            onRun={handleRunStatusUpdate}
            running={statusUpdateRunning || azurePermissions.granting}
            countdown={statusUpdateCountdown}
            disabled={statusUpdateDisabled || azurePermissions.granting}
          />
          {(permissionError ?? runError) && <ErrorText>{permissionError ?? runError}</ErrorText>}
        </Box>
        {stageDef.prerequisites.length > 0 && (
          <Box>
            <Typography
              variant="sectionLabel"
              sx={{ mb: 1 }}
            >
              Prerequisites
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {stageDef.prerequisites.map((prereq, i) => {
                const met = checkPrerequisite(prereq, cardStatus, variableValues);
                const label = prereqLabel(prereq, variableValues);
                const isExpandable = prereq.type === "varGroup" || prereq.type === "stageVar";
                const isOpen = !!expandedPrereqs[i];
                const prereqHasDeployedDiff =
                  deployedEnv != null &&
                  (((prereq.type === "varGroup" || prereq.type === "stageVar") &&
                    prereq.keys.some((k) => (variableValues[k] ?? "") !== (deployedEnv[k] ?? ""))) ||
                    (prereq.type === "var" && (variableValues[prereq.key] ?? "") !== (deployedEnv[prereq.key] ?? "")));
                return (
                  <Box key={`${stageDef.dir}-${i}`}>
                    <Box
                      component={isExpandable ? "button" : "div"}
                      type={isExpandable ? "button" : undefined}
                      aria-expanded={isExpandable ? isOpen : undefined}
                      aria-controls={isExpandable ? `${stageDef.dir}-prerequisite-${i}` : undefined}
                      onClick={isExpandable ? () => setExpandedPrereqs((prev) => ({ ...prev, [i]: !prev[i] })) : undefined}
                      sx={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                        gap: 1,
                        py: 0.5,
                        px: isExpandable ? 0.75 : 0,
                        mx: isExpandable ? -0.75 : 0,
                        borderRadius: "6px",
                        border: 0,
                        backgroundColor: "transparent",
                        textAlign: "left",
                        font: "inherit",
                        cursor: isExpandable ? "pointer" : "default",
                        userSelect: "none",
                        "&:hover": isExpandable ? { backgroundColor: "action.hover" } : {},
                      }}
                    >
                      {met && prereqHasDeployedDiff ? (
                        <Tooltip title="Changed since last plan" placement="top" arrow>
                          <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "warning.main", flexShrink: 0 }} />
                        </Tooltip>
                      ) : met ? (
                        <CheckCircleIcon aria-hidden="true" sx={{ typography: "caption", color: "success.main", flexShrink: 0 }} />
                      ) : (
                        <RadioButtonUncheckedIcon aria-hidden="true" sx={{ typography: "caption", color: "text.disabled", flexShrink: 0 }} />
                      )}
                      <Typography color={met ? "text.secondary" : "text.muted"} sx={{ flex: 1 }}>{label}</Typography>
                      {isExpandable &&
                        (isOpen ? <ExpandLessIcon aria-hidden="true" sx={{ typography: "body2", color: "text.disabled" }} /> : <ExpandMoreIcon aria-hidden="true" sx={{ typography: "body2", color: "text.disabled" }} />)}
                    </Box>

                    {isExpandable && isOpen && (
                      <Box id={`${stageDef.dir}-prerequisite-${i}`} role="region" aria-label={`${label} details`} sx={{ ml: 2.75, mt: 0.5, mb: 1 }}>
                        {prereq.type === "varGroup" && (
                          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
                            {prereq.keys.map((k, ki) => (
                              <Box
                                key={k}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                  px: 2,
                                  py: 0.75,
                                  borderBottom: ki < prereq.keys.length - 1 ? "1px solid" : "none",
                                  borderColor: "divider",
                                  backgroundColor: ki % 2 === 0 ? "background.paper" : "background.default",
                                }}
                              >
                                <Typography
                                  sx={{
                                    color: "text.secondary",
                                    minWidth: "11rem",
                                    flexShrink: 0,
                                  }}
                                >
                                  {k}
                                </Typography>
                                <Typography
                                  sx={{
                                    color: variableValues[k] ? "text.primary" : "text.disabled",
                                    wordBreak: "break-all",
                                    flex: 1,
                                  }}
                                >
                                  {variableValues[k] || "not set"}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        )}
                        {prereq.type === "stageVar" && (
                          <StageVarEditor
                            prereq={prereq}
                            savedValues={variableValues}
                            deployedValues={deployedEnv ?? undefined}
                            account={account}
                            repo={repoName}
                            selectedEnv={selectedEnv}
                            onVariableConfirmed={onVariableConfirmed}
                          />
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {hasDetails && (
          <StagePlanDetail
            items={planItems}
            summary={planSummary}
            loading={planLoading}
            error={planError}
            onDeploy={onDeploy}
            stagesStale={deployDisabled}
            behind={isPlanBehind(stage, latestSha)}
            planSha={stage.planSha}
            latestSha={latestSha}
          />
        )}

        <RemoteTerminal session={remoteTerminal} />

        {!hasDetails && stage.status !== "pending" && (
          <Typography color={stage.status === "failed" ? "error.main" : "text.disabled"} role="status">
            No plan is available for this stage. Check the GitHub Actions run for errors, then create a new plan.
          </Typography>
        )}

        {stage.status === "failed" && stage.planLogId && <FailureLog fetched={planLogFetched} text={planLog?.text ?? null} />}

        {(stage.deployedAt || stage.deployStatus) && (
          <Box>
            <Typography
              variant="sectionLabel"
              sx={{ mb: 0.75 }}
            >
              Last Deploy
            </Typography>
            {/* The ViewLink button is far taller than the timestamp, so the icon centres on this
                row and everything below indents past it rather than sharing a column with it. */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {stage.deployStatus === "success" ? (
                <CheckCircleIcon aria-hidden="true" sx={{ typography: "caption", color: "success.main", flexShrink: 0 }} />
              ) : stage.deployStatus === "cancelled" ? (
                <BlockIcon aria-hidden="true" sx={{ typography: "caption", color: "text.muted", flexShrink: 0 }} />
              ) : stage.deployStatus === "failed" ? (
                <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "error.main", flexShrink: 0 }} />
              ) : null}
              {stage.deployedAt && <Typography color="text.secondary">{relativeTime(stage.deployedAt)}</Typography>}
              {/* The apply's own run, not the plan's — the header link points at the plan. */}
              {repoFullName && stage.deployRunId && <ViewLink href={getWorkflowRunUrl(repoFullName, stage.deployRunId)} label="Open deployment run in GitHub" />}
            </Box>
            {/* 13px icon + the 8px gap above. */}
            <Box sx={{ pl: "21px" }}>
              {stage.deployStatus === "cancelled" && <Typography color="text.muted">Cancelled</Typography>}
              {stage.deployStatus === "failed" && <FailureLog fetched={deployLogFetched} text={deployLog?.text ?? null} />}
            </Box>
          </Box>
        )}
        <ProcessRetryNotice
          started={
            statusUpdateRunning ||
            deployStarted ||
            stage.status === "success" ||
            stage.status === "failed" ||
            stage.status === "deployed" ||
            !!stage.deployStatus
          }
        />
      </Box>
    </Card>
  );
}
