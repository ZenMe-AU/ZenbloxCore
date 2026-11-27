/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Shared view of a provisioning run (resource-provisioning-standard.md); card-agnostic, everything comes from props.

import { useRef, useState, type ReactNode } from "react";
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Collapse,
  IconButton,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import UndoIcon from "@mui/icons-material/Undo";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { isSettled, stageStatus, type StageStatus, type TaskState, type TaskStatus } from "../logic/provisioning";
import type { UseProvisioning } from "../hooks/util/useProvisioning";
import ErrorText from "./ErrorText";

// ─── Data a card passes in ────────────────────────────────────────────────────

type ResourceNameEdit = {
  check: (name: string) => Promise<boolean>; // Format and availability; false leaves its message in `error`.
  apply: (name: string) => void; // Makes the name the one the next task uses.
  error?: string | null; // Why the last check failed; shown in the editor for the name it checked.
  checking: boolean;
};

type ResourceRowData = {
  key: string; // Also the anchor an Action required summary scrolls to.
  type: string;
  name: string;
  href?: string | null; // The resource's own page, once it exists.
  taskIds: readonly string[]; // The tasks that create it; their state is the row's status.
  exists?: boolean; // Known to exist from an earlier run or a live check.
  plainStatus?: boolean; // Status reads Created / Already exists, never the task's detail (e.g. a zone's name servers).
  checking?: string; // A live check of whether it exists is under way, e.g. "Checking whether this domain is already set up".
  edit?: ResourceNameEdit;
};

export type ResourceGroupData = { id: string; name: string; href?: string | null; note?: string; rows: readonly ResourceRowData[] };

// ─── Status words and icons ───────────────────────────────────────────────────

const TASK_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Done",
  skipped: "Skipped",
  blocked: "Blocked",
  action_required: "Action required",
  retrying: "Retrying",
  failed: "Failed",
};

const STAGE_LABEL: Record<StageStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  blocked: "Blocked",
  action_required: "Action required",
  failed: "Failed",
};

// The icon repeats the word next to it, so status never rests on color alone.
function StatusIcon({ status, label }: { status: TaskStatus | StageStatus; label: string }) {
  const sx = { typography: "body2" } as const;
  if (status === "running" || status === "retrying") return <CircularProgress size={12} aria-label={label} />;
  if (status === "completed") return <CheckCircleOutlineIcon aria-hidden="true" sx={{ ...sx, color: (theme) => theme.vars.palette.card.icon.complete }} />;
  if (status === "skipped") return <RemoveCircleOutlineIcon aria-hidden="true" sx={{ ...sx, color: (theme) => theme.vars.palette.card.icon.skipped }} />;
  if (status === "failed") return <ErrorOutlineIcon aria-hidden="true" sx={{ ...sx, color: "error.main" }} />;
  if (status === "action_required") return <WarningAmberIcon aria-hidden="true" sx={{ ...sx, color: "warning.main" }} />;
  if (status === "blocked") return <PauseCircleOutlineIcon aria-hidden="true" sx={{ ...sx, color: "text.disabled" }} />;
  return <RadioButtonUncheckedIcon aria-hidden="true" sx={{ ...sx, color: (theme) => theme.vars.palette.card.icon.unavailable }} />;
}

// One status for a row made by several tasks: intervention first, done only when all are.
const ROW_ORDER: TaskStatus[] = ["action_required", "failed", "retrying", "running", "blocked", "pending"];
function rowStatus(tasks: (TaskState | undefined)[]): TaskStatus {
  const statuses = tasks.map((task) => task?.status ?? "pending");
  const first = ROW_ORDER.find((status) => statuses.includes(status));
  if (first) return first;
  return statuses.every((status) => status === "skipped") ? "skipped" : "completed";
}

function rowStatusText(status: TaskStatus, started: boolean, exists: boolean, tasks: (TaskState | undefined)[], plain: boolean) {
  if (!started && status === "pending") return exists ? "Exists" : "Not created";
  if (status === "completed") return "Created";
  if (status === "skipped") return (!plain && tasks.find((task) => task?.detail)?.detail) || "Already exists";
  return TASK_LABEL[status];
}

// ─── External link ────────────────────────────────────────────────────────────

const TRUSTED_HOSTS = ["portal.azure.com", "entra.microsoft.com", "github.com"];
const isTrusted = (href: string) => {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && TRUSTED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
};

// The name itself is the link once the resource exists; until then, or for an unknown host, it is plain text.
function ManageLink({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href || !isTrusted(href)) return <>{children}</>;
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" title={href} underline="hover" onClick={(event) => event.stopPropagation()}>
      {children}
      <span className="visually-hidden"> (opens in new tab)</span>
    </Link>
  );
}

// ─── Name editing ─────────────────────────────────────────────────────────────

// The pencil, check and undo: the size of the text they sit beside, centred on it by a flex row.
const inlineButtonSx = { p: 0.25, flexShrink: 0 } as const;

function NameEditor({ row, edit, onDone }: { row: ResourceRowData; edit: ResourceNameEdit; onDone: (applied: boolean) => void }) {
  const [draft, setDraft] = useState(row.name);
  const [checking, setChecking] = useState(false);
  // The draft whose check failed: the message is about that name, so it goes once the draft changes or the edit is undone.
  const [failed, setFailed] = useState<string | null>(null);
  const request = useRef(0);
  const error = failed === draft ? (edit.error ?? "Could not check the name") : null;

  const apply = async () => {
    const token = ++request.current;
    setChecking(true);
    const ok = await edit.check(draft).catch(() => false);
    // A newer draft or an Undo won; this answer is about a name no longer on screen.
    if (token !== request.current) return;
    setChecking(false);
    if (!ok) {
      setFailed(draft);
      return;
    }
    edit.apply(draft);
    onDone(true);
  };

  // The error goes below the row, so the buttons stay centred on the box, not on the box and its message.
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <TextField
          size="small"
          value={draft}
          onChange={(event) => {
            request.current++;
            setChecking(false);
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void apply();
            if (event.key === "Escape") onDone(false);
          }}
          error={!!error}
          className="corpTechnicalInput"
          inputProps={{ "aria-label": `${row.type} name` }}
          sx={{ minWidth: 0, flex: "1 1 200px", "& .MuiInputBase-input": { py: 0.35 } }}
        />
        {/* Stays open until the name is one this installation can actually create or reuse. */}
        <IconButton aria-label={`Confirm ${row.type} name`} size="small" onClick={() => void apply()} disabled={checking || edit.checking || !draft} sx={{ ...inlineButtonSx, color: "success.main" }}>
          {checking || edit.checking ? <CircularProgress size={12} aria-label={`Checking ${row.type} name`} /> : <CheckIcon sx={{ typography: "caption" }} />}
        </IconButton>
        <IconButton aria-label={`Undo ${row.type} name`} size="small" onClick={() => { request.current++; onDone(false); }} sx={{ ...inlineButtonSx, color: "text.muted", "&:hover": { color: "warning.main" } }}>
          <UndoIcon sx={{ typography: "caption" }} />
        </IconButton>
      </Box>
      {error && <ErrorText>{error}</ErrorText>}
    </Box>
  );
}

// ─── Resources ────────────────────────────────────────────────────────────────

type ResourceListProps = {
  groups: readonly ResourceGroupData[];
  provisioning: UseProvisioning; // The card's run; statuses come from it once started, before that from `exists`.
  title: string;
  // The row whose name is open for editing, held by the card so it can decide what else may run meanwhile.
  editing: string | null;
  onEditingChange: (rowKey: string | null) => void;
};

export function ResourceGroupList({ groups, provisioning, title, editing, onEditingChange: setEditing }: ResourceListProps) {
  const { state, started, running } = provisioning;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fixed, setFixed] = useState<Record<string, boolean>>({}); // Rows whose new name waits for Retry & continue.
  const itemCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const allCollapsed = groups.length > 0 && groups.every((group) => collapsed[group.id]);

  if (groups.length === 0) return <Typography color="text.secondary">Nothing to create.</Typography>;

  return (
    <Box component="section" aria-label={title} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="sectionLabel">{title}</Typography>
        <Typography color="text.muted">
          {groups.length} {groups.length === 1 ? "group" : "groups"}, {itemCount} items (groups themselves not counted)
        </Typography>
        <Button size="small" sx={{ ml: "auto" }} onClick={() => setCollapsed(Object.fromEntries(groups.map((group) => [group.id, !allCollapsed])))}>
          {allCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      </Box>

      {groups.map((group) => {
        const open = !collapsed[group.id];
        const regionId = `resource-group-${group.id}`;
        const toggle = () => setCollapsed((current) => ({ ...current, [group.id]: open }));
        return (
          <Box key={group.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            {/* The arrow is the toggle for keyboards; the rest of the header toggles on click too, except the name's link. */}
            <Box onClick={toggle} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, minHeight: 40, cursor: "pointer" }}>
              <ButtonBase
                onClick={(event) => {
                  event.stopPropagation();
                  toggle();
                }}
                aria-expanded={open}
                aria-controls={regionId}
                aria-label={group.name}
                sx={{ p: 0.5, borderRadius: 0.5, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
              >
                <KeyboardArrowDownIcon aria-hidden="true" sx={{ typography: "body2", transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.2s" }} />
              </ButtonBase>
              <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                <ManageLink href={group.href}>{group.name}</ManageLink>
              </Typography>
              <Typography color="text.muted">
                {group.rows.length} {group.rows.length === 1 ? "item" : "items"}
              </Typography>
              {!group.href && group.note && (
                <Typography color="text.muted" sx={{ ml: "auto" }}>
                  {group.note}
                </Typography>
              )}
            </Box>
            <Collapse in={open} timeout={200}>
              <Box id={regionId} role="region" aria-label={group.name} sx={{ overflowX: "auto", borderTop: "1px solid", borderColor: "divider" }}>
                <Table size="small" sx={{ "& td, & th": { py: 0.5, borderColor: "divider" } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: "26%" }}>Resource type</TableCell>
                      <TableCell>Resource name</TableCell>
                      <TableCell sx={{ width: "28%" }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {group.rows.map((row) => {
                      const tasks = row.taskIds.map((id) => state[id]);
                      const status = row.taskIds.length ? rowStatus(tasks) : "pending";
                      const created = started && row.taskIds.length > 0 && tasks.every((task) => isSettled(task?.status));
                      const needsName = tasks.some((task) => task?.status === "action_required" && task.error?.kind === "name_conflict");
                      // A created resource is never renamed here; mid-run only the row that asks for a name can change.
                      const canEdit = !!row.edit && !created && (!running || needsName) && !tasks.some((task) => task?.status === "running");
                      const retryIds = row.taskIds.filter((id) => state[id]?.status === "action_required" || state[id]?.status === "failed");
                      const error = tasks.find((task) => task?.status === "action_required" || task?.status === "failed")?.error;
                      const checking = !started && row.checking;
                      const statusText = checking || (row.taskIds.length ? rowStatusText(status, started, !!row.exists, tasks, !!row.plainStatus) : row.exists ? "Exists" : "Not created");
                      return (
                        <TableRow key={row.key} id={`resource-row-${row.key}`} sx={needsName ? { backgroundColor: "action.hover" } : undefined}>
                          <TableCell sx={{ color: "text.muted", verticalAlign: "top" }}>{row.type}</TableCell>
                          <TableCell sx={{ verticalAlign: "top", overflowWrap: "anywhere" }}>
                            {editing === row.key && row.edit ? (
                              <NameEditor
                                row={row}
                                edit={row.edit}
                                onDone={(applied) => {
                                  setEditing(null);
                                  if (applied && needsName) setFixed((current) => ({ ...current, [row.key]: true }));
                                }}
                              />
                            ) : (
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                                <Typography className="corpTechnicalInput" sx={{ color: "text.primary", minWidth: 0 }}>
                                  <ManageLink href={row.href}>{row.name}</ManageLink>
                                </Typography>
                                {canEdit && (
                                  <IconButton aria-label={`Edit ${row.type} name`} size="small" onClick={() => setEditing(row.key)} sx={{ ...inlineButtonSx, color: "text.muted", "&:hover": { color: "primary.main" } }}>
                                    <EditIcon sx={{ typography: "caption" }} />
                                  </IconButton>
                                )}
                              </Box>
                            )}
                            {error && editing !== row.key && <ErrorText>{error.message}</ErrorText>}
                          </TableCell>
                          <TableCell sx={{ verticalAlign: "top" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                              <StatusIcon status={checking ? "running" : status === "pending" && row.exists && !started ? "skipped" : status} label={statusText} />
                              <Typography component="span">{statusText}</Typography>
                              {retryIds.length > 0 && (!needsName || fixed[row.key]) && (
                                <Button
                                  size="small"
                                  onClick={() => {
                                    setFixed((current) => ({ ...current, [row.key]: false }));
                                    void provisioning.retry(retryIds);
                                  }}
                                >
                                  {needsName ? "Retry & continue" : "Retry"}
                                </Button>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Concise progress ─────────────────────────────────────────────────────────

type ProgressProps = {
  provisioning: UseProvisioning;
  rowOfTask: (taskId: string) => string | undefined; // Which resource row an Action required item points at.
};

// One line while a run is going or something waits on the user; nothing when idle.
export function ProvisioningProgress({ provisioning, rowOfTask }: ProgressProps) {
  const { plan, state, running, started, progress } = provisioning;
  const waiting = [...plan.tasks.values()].filter((task) => state[task.id]?.status === "action_required" || state[task.id]?.status === "failed");
  const current = [...plan.tasks.values()].filter((task) => state[task.id]?.status === "running" || state[task.id]?.status === "retrying");
  if (!started || (!running && waiting.length === 0)) return null;

  const locate = (taskId: string) => {
    const row = rowOfTask(taskId);
    const task = plan.tasks.get(taskId);
    const element = document.getElementById(row ? `resource-row-${row}` : `deployment-task-${task?.moduleId}-${task?.def.key}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <Box role="status" aria-live="polite" sx={{ border: "1px solid", borderColor: waiting.length ? "warning.main" : "divider", borderRadius: 1, px: 1.5, py: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography>
        {progress.settled} of {progress.total} tasks done
        {progress.running > 0 && ` · ${progress.running} running`}
        {progress.actionRequired > 0 && ` · ${progress.actionRequired} need action`}
        {progress.failed > 0 && ` · ${progress.failed} failed`}
      </Typography>
      {current.length > 0 && (
        <Typography color="text.muted" sx={{ overflowWrap: "anywhere" }}>
          Now: {current.map((task) => task.label).join("; ")}
        </Typography>
      )}
      {waiting.map((task) => (
        <Box key={task.id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <StatusIcon status={state[task.id].status} label={TASK_LABEL[state[task.id].status]} />
          <Typography sx={{ overflowWrap: "anywhere" }}>
            {TASK_LABEL[state[task.id].status]}: {task.label}
          </Typography>
          <Button size="small" onClick={() => locate(task.id)}>
            Show
          </Button>
          {/* A name conflict is retried from its row, after a new name is applied. */}
          {state[task.id].error?.kind !== "name_conflict" && (
            <Button size="small" onClick={() => void provisioning.retry([task.id])}>
              Retry
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
}

// ─── Deployment details ───────────────────────────────────────────────────────

const duration = (task: TaskState) =>
  task.startedAt && task.completedAt ? `${Math.max(0, Math.round((task.completedAt - task.startedAt) / 1000))}s` : null;

function TaskRow({ domId, label, task, sharedWith }: { domId: string; label: string; task: TaskState; sharedWith: string[] }) {
  const time = duration(task);
  const retries = task.history.filter((entry) => entry.status === "retrying").length;
  return (
    <Box id={domId} sx={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 0.75, py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.4em" }}>
        <StatusIcon status={task.status} label={`${TASK_LABEL[task.status]}: ${label}`} />
      </Box>
      <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <Typography sx={{ color: task.status === "failed" ? "error.main" : "text.secondary" }}>
          {label}
          <Box component="span" sx={{ color: "text.muted" }}>
            {" "}· {TASK_LABEL[task.status]}
            {time && ` · ${time}`}
            {task.attempts > 1 && ` · attempt ${task.attempts}`}
            {retries > 0 && ` · ${retries} automatic ${retries === 1 ? "retry" : "retries"}`}
          </Box>
        </Typography>
        {sharedWith.length > 0 && <Typography color="text.muted">Shared with {sharedWith.join(", ")}; runs once</Typography>}
        {task.detail && (
          <Typography data-sensitive="true" sx={{ color: (theme) => theme.vars.palette.card.mutedText }}>
            {task.error ? `${task.error.code}: ` : ""}
            {task.detail}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export function DeploymentDetails({ provisioning, footer }: { provisioning: UseProvisioning; footer?: ReactNode }) {
  const { plan, state } = provisioning;
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // Only what the reader chose; the rest follows status.
  const stageLabel = (id: string) => plan.stages.find((stage) => stage.id === id)?.label ?? id;

  return (
    <Box component="section" aria-label="Deployment details" sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      <ButtonBase
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="deployment-details"
        sx={{ alignSelf: "flex-start", display: "flex", gap: 0.5, borderRadius: 0.5, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
      >
        <KeyboardArrowDownIcon aria-hidden="true" sx={{ typography: "body2", transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.2s" }} />
        <Typography variant="sectionLabel">Deployment details</Typography>
      </ButtonBase>
      <Collapse in={open} timeout={200}>
        <Box id="deployment-details" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {plan.stages.map((stage) => {
            const status = stageStatus(stage, state);
            const done = stage.steps.filter((step) => isSettled(state[step.taskId]?.status)).length;
            const isOpen = expanded[stage.id] ?? (status === "running" || status === "action_required" || status === "failed");
            const regionId = `deployment-stage-${stage.id}`;
            return (
              <Box key={stage.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <ButtonBase
                  onClick={() => setExpanded((current) => ({ ...current, [stage.id]: !isOpen }))}
                  aria-expanded={isOpen}
                  aria-controls={regionId}
                  sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1, px: 1, minHeight: 40, justifyContent: "flex-start", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
                >
                  <StatusIcon status={status} label={STAGE_LABEL[status]} />
                  <Typography sx={{ fontWeight: 600, flex: 1, textAlign: "left" }}>{stage.label}</Typography>
                  <Typography color="text.muted">
                    {done}/{stage.steps.length}
                  </Typography>
                  <Typography sx={{ minWidth: 110, textAlign: "right" }}>{STAGE_LABEL[status]}</Typography>
                  <KeyboardArrowDownIcon aria-hidden="true" sx={{ typography: "body2", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </ButtonBase>
                <Collapse in={isOpen} timeout={200}>
                  <Box id={regionId} role="region" aria-label={stage.label} sx={{ px: 1.5, pb: 1, borderTop: "1px solid", borderColor: "divider" }}>
                    {stage.steps.map((step) => (
                      <TaskRow
                        key={step.key}
                        domId={`deployment-task-${stage.id}-${step.key}`}
                        label={step.label}
                        task={state[step.taskId] ?? { status: "pending", attempts: 0, history: [] }}
                        sharedWith={(plan.tasks.get(step.taskId)?.stageIds ?? []).filter((id) => id !== stage.id).map(stageLabel)}
                      />
                    ))}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
          {footer}
        </Box>
      </Collapse>
    </Box>
  );
}
