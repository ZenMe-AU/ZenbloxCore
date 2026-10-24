/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import type { UseCoreInfraCard } from "./useCoreInfraCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import { EditableNameRow, PlainRow, SelectionRow } from "../../components/ResourceRows";
import ViewLink from "../../components/ViewLink";
import { AZURE_RESOURCE_GROUPS_URL, getAzureResourceUrl } from "../../logic/consoleUrls";
import { resourceGroupScope } from "../../api/azureArm";
import { getVariableDisplayName, CORP_NAME_KEYS, TFSTATE_BACKEND_KEYS } from "../../logic/variables";
import CloudVariableDetail from "../CloudVariableDetail";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import StatusText from "../../components/StatusText";
import type { Account, CardChrome, AzureAccount, GhEnv } from "../../types";

const CORE_INFRA_KEYS = [...CORP_NAME_KEYS, ...TFSTATE_BACKEND_KEYS];

type Props = {
  card: CardChrome;
  infra: UseCoreInfraCard;
  azureAccount: AzureAccount | null;
  corpName: string;
  subscriptionId: string;
  spClientId: string;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

function Intro({ containerName }: { containerName: string }) {
  return (
    <Typography variant="body1" color="text.secondary">
      Creates the root Azure resources — resource group, Log Analytics, Application Insights, the private storage account — then the{" "}
      {containerName}{" "}
      container Terraform uses for state, granting GitHub Actions access to it.
    </Typography>
  );
}

function Action({ resourceId }: { resourceId: string | null }) {
  return <ViewLink href={resourceId ? getAzureResourceUrl(undefined, resourceId) : AZURE_RESOURCE_GROUPS_URL} />;
}

export default function CoreInfraCard({
  card,
  infra,
  azureAccount,
  corpName,
  subscriptionId,
  spClientId,
  githubAccount,
  repoName,
  selectedEnv,
  variables,
  githubUrl,
}: Props) {
  const {
    location,
    setLocation,
    locations,
    locationsLoading,
    locationsError,
    steps,
    running,
    done,
    infraRbacStatus,
    resultMatches,
    run,
    reset,
    resourceGroupName,
    lawName,
    storageAccountName,
    setStorageAccount,
    storageChecking,
    storageError,
    checkStorageAccount,
    containerName,
    result,
    runNonce,
  } = infra;
  const disabled = card.locked;
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingStorage, setEditingStorage] = useState(false);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const prevRunNonceRef = useRef(runNonce);

  // A finished run saves the backend names straight away: stages read them from corp.env, not from here.
  useEffect(() => {
    if (runNonce === prevRunNonceRef.current) return;
    prevRunNonceRef.current = runNonce;
    const t = setTimeout(() => setAutoSaveCounter((c) => c + 1), 0);
    return () => clearTimeout(t);
  }, [runNonce]);

  const populate =
    result && resultMatches
      ? {
          TF_STATE_RESOURCE_GROUP: result.stateResourceGroup,
          TF_STATE_STORAGE_ACCOUNT: result.storageAccountName,
          TF_STATE_CONTAINER: containerName,
        }
      : undefined;

  const missing: string[] = [];
  if (!corpName) missing.push(getVariableDisplayName("NAME"));
  if (!subscriptionId) missing.push("AZURE_SUBSCRIPTION_ID");
  if (!spClientId) missing.push("AZURE_CLIENT_ID");
  const ready = !!azureAccount && missing.length === 0;

  // Previously completed for this target, but the live check now shows the resource group is gone or the SP lost access.
  const rgNotFound = resultMatches && infraRbacStatus === "rg-not-found";
  const rgRbacMissing = resultMatches && infraRbacStatus === "missing-role";


  const rgExists = !!subscriptionId && !!infra.resourceGroupName && (infra.infraRbacStatus === "ready" || infra.infraRbacStatus === "missing-role");

  return (
    <Card
      title="Terraform state backend"
      action={<Action resourceId={rgExists ? resourceGroupScope(subscriptionId, infra.resourceGroupName) : null} />}
      lockedIntro={<Intro containerName={containerName} />}
      {...card}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro containerName={containerName} />

        {/* Gating hints */}
        {!azureAccount && (
          <Box role="status" aria-live="polite" sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25 }}>
            <Typography color="warning.dark">Sign in with Azure first — this card reuses that session.</Typography>
          </Box>
        )}
        {azureAccount && missing.length > 0 && (
          <Box role="status" aria-live="polite" sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25 }}>
            <Typography color="warning.dark">
              Missing before setup can run: <b>{missing.join(", ")}</b>
            </Typography>
          </Box>
        )}

        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={CORE_INFRA_KEYS}
          hiddenKeys={TFSTATE_BACKEND_KEYS}
          variables={variables}
          populate={populate}
          title="Company short code"
          githubUrl={githubUrl}
          autoSaveCounter={autoSaveCounter}
        />

        {rgNotFound && (
          <Box
            sx={{
              backgroundColor: "background.default",
              border: "1px solid",
              borderColor: "warning.main",
              borderRadius: 1,
              px: 2,
              py: 1.25,
              display: "flex",
              gap: 1,
            }}
            role="status"
            aria-live="polite"
          >
            <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
            <Typography color="warning.dark">
              The resource group doesn't exist in the selected subscription anymore — re-run to recreate it.
            </Typography>
          </Box>
        )}

        {rgRbacMissing && (
          <Box
            sx={{
              backgroundColor: "background.default",
              border: "1px solid",
              borderColor: "warning.main",
              borderRadius: 1,
              px: 2,
              py: 1.25,
              display: "flex",
              gap: 1,
            }}
            role="status"
            aria-live="polite"
          >
            <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
            <Typography color="warning.dark">GitHub Actions has no access on the resource group — re-run to grant it.</Typography>
          </Box>
        )}

        {/* Planned resources */}
        {ready && steps.length === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box>
              <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Resources</Typography>
              <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
                <PlainRow label="Resource group" value={resourceGroupName} />
                <PlainRow label="Log Analytics" value={lawName} />

                {/* Global to Azure, so it has to be changeable when another tenant already holds it. */}
                <EditableNameRow
                  label="Storage account"
                  value={storageAccountName}
                  onChange={setStorageAccount}
                  error={storageError}
                  checking={storageChecking}
                  check={checkStorageAccount}
                  editing={editingStorage}
                  setEditing={setEditingStorage}
                  width={200}
                />

                <PlainRow label="State container" value={containerName} />

                <SelectionRow
                  id="core-infra-location"
                  label="Location"
                  name="Azure region"
                  value={location}
                  onChange={setLocation}
                  options={locations.map((l) => ({ value: l.name, label: l.displayName }))}
                  error={locationsError ? "Couldn't load Azure region list — type the region name manually." : null}
                  loading={locationsLoading}
                  placeholder="e.g. australiaeast"
                  editing={editingLocation}
                  setEditing={setEditingLocation}
                />
              </Box>
            </Box>

            <Button
              variant="contained"
              onClick={run}
              disabled={disabled || running || !location.trim() || editingStorage}
              sx={{
                alignSelf: "flex-start",
                py: 0.85,
                px: 2.5,
              }}
            >
              {done ? "Re-run setup" : "Create core infrastructure"}
            </Button>
          </Box>
        )}

        {/* Progress steps */}
        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {running && <StatusText>Running...</StatusText>}
            {!running && (
              <Button
                size="small"
                onClick={reset}
                sx={{
                  alignSelf: "flex-start",
                  mt: 0.5,
                  color: "text.muted",
                  "&:hover": { color: "primary.main" },
                }}
              >
                ↩ Start over
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Card>
  );
}
