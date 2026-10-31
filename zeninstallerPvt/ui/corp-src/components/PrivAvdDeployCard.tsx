/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import BlockIcon from "@mui/icons-material/Block";
import { createVariable, fetchLogArtifact, updateVariable } from "../api";
import { getWorkflowRunUrl } from "../logic/github";
import Card from "./Card";
import ErrorText from "./ErrorText";
import ViewLink from "./ViewLink";
import EditableNameRow from "../cards/RemoteTerminalInfra/EditableNameRow";
import RemoteTerminal from "../cards/Stage/RemoteTerminal";
import { FailureLog } from "../cards/Stage/StageCard";
import type { UseGithubVariables } from "../hooks/useGithubVariables";
import type { PrivAvdDeploy, PrivAvdTarget } from "../hooks/util/usePrivAvdDeploy";
import type { CardChrome } from "../types";

export type PrivAvdResource = {
  readonly key: string;
  readonly label: string;
  readonly defaultValue: string;
  readonly editable?: boolean;
  readonly hint?: string;
};

// What App hands each PrivAVD card; the card itself adds its own constants.
export type PrivAvdDeployCardProps = PrivAvdTarget & {
  card: CardChrome;
  privAvd: PrivAvdDeploy;
  variables: UseGithubVariables;
};

function ResourceRow({
  resource,
  value,
  onChange,
  editing,
  setEditing,
}: {
  resource: PrivAvdResource;
  value: string;
  onChange: (value: string) => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  if (!resource.editable) {
    return (
      <Typography color="text.muted">
        {resource.label}:{" "}
        <Box component="span" sx={{ color: "text.primary" }}>
          {value}
        </Box>
      </Typography>
    );
  }
  return (
    <EditableNameRow
      label={resource.label}
      value={value}
      onChange={(v) => {
        setError(null);
        onChange(v);
      }}
      error={error}
      checking={false}
      check={async () => {
        if (value.trim()) return true;
        setError("Required");
        return false;
      }}
      editing={editing}
      setEditing={setEditing}
      width={260}
      hint={resource.hint}
    />
  );
}

export default function PrivAvdDeployCard({
  title,
  description,
  resources,
  card,
  privAvd,
  account,
  repoName,
  selectedEnv,
  variables,
}: PrivAvdDeployCardProps & { title: string; description: string; resources: readonly PrivAvdResource[] }) {
  const { report } = privAvd;
  const [deployLog, setDeployLog] = useState<{ id: number; text: string | null } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editingKeys, setEditingKeys] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const id = report?.deployLogId;
    if (report?.deployStatus !== "failed" || !id || !account) return;
    fetchLogArtifact(account, repoName, id)
      .then((text) => setDeployLog({ id, text }))
      .catch(console.error);
  }, [report?.deployLogId, report?.deployStatus, account, repoName]);

  const valueOf = ({ key, defaultValue }: PrivAvdResource) => (overrides[key] ?? (variables.values[key] || defaultValue)).trim();

  // The workflow reads these from the GitHub environment, so anything new or edited is saved before it is dispatched.
  const deploy = async () => {
    if (!account || !selectedEnv) return;
    setSaveError(null);
    try {
      for (const resource of resources) {
        const value = valueOf(resource);
        const saved = variables.values[resource.key];
        if (value === saved) continue;
        await (saved ? updateVariable : createVariable)(account, repoName, resource.key, value, selectedEnv.name);
        variables.onConfirmed(resource.key, value);
      }
    } catch (e) {
      console.error("Failed to save the PrivAVD variables:", e);
      setSaveError("Couldn't save the variables to GitHub");
      return;
    }
    await privAvd.deploy();
  };

  const repoFullName = account && repoName ? `${account.login}/${repoName}` : null;
  const intro = (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      {description}
    </Typography>
  );

  return (
    <Card title={title} lockedIntro={intro} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {intro}

        <Box>
          <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>
            Resources
          </Typography>
          <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
            {resources.map((resource) => (
              <ResourceRow
                key={resource.key}
                resource={resource}
                value={overrides[resource.key] ?? (variables.values[resource.key] || resource.defaultValue)}
                onChange={(value) => setOverrides((prev) => ({ ...prev, [resource.key]: value }))}
                editing={editingKeys.includes(resource.key)}
                setEditing={(on) => setEditingKeys((keys) => (on ? [...keys, resource.key] : keys.filter((k) => k !== resource.key)))}
              />
            ))}
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={() => void deploy()}
            disabled={privAvd.deploying || variables.loading || editingKeys.length > 0 || !selectedEnv}
            sx={{ py: 0.85, px: 2.5 }}
          >
            {privAvd.deploying ? "Deploying..." : privAvd.done ? "Re-deploy" : "Deploy"}
          </Button>
          <Typography color="text.secondary">Runs with your own Azure permissions — sign in with the code the terminal shows.</Typography>
        </Box>
        {(saveError ?? privAvd.error) && <ErrorText>{saveError ?? privAvd.error}</ErrorText>}

        <RemoteTerminal session={privAvd.terminal} />

        {report?.deployStatus && (
          <Box>
            <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>
              Last Deploy
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {report.deployStatus === "success" ? (
                <CheckCircleIcon aria-hidden="true" sx={{ typography: "caption", color: "success.main", flexShrink: 0 }} />
              ) : report.deployStatus === "cancelled" ? (
                <BlockIcon aria-hidden="true" sx={{ typography: "caption", color: "text.muted", flexShrink: 0 }} />
              ) : (
                <WarningAmberIcon aria-hidden="true" sx={{ typography: "caption", color: "error.main", flexShrink: 0 }} />
              )}
              {report.deployedAt && <Typography color="text.secondary">{new Date(report.deployedAt * 1000).toLocaleString()}</Typography>}
              {repoFullName && report.deployRunId && <ViewLink href={getWorkflowRunUrl(repoFullName, report.deployRunId)} />}
            </Box>
            {report.deployStatus === "failed" && (
              <Box sx={{ pl: "21px" }}>
                <FailureLog fetched={!!report.deployLogId && deployLog?.id === report.deployLogId} text={deployLog?.text ?? null} />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Card>
  );
}
