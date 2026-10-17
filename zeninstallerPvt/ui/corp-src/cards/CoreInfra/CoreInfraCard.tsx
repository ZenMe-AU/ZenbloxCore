/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, CircularProgress, IconButton, MenuItem, Select, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { UseCoreInfraCard } from "./useCoreInfraCard";
import StepRow from "../StepRow";
import Card from "../../components/Card";
import ViewLink from "../../components/ViewLink";
import { AZURE_RESOURCE_GROUPS_URL, getAzureResourceUrl } from "../../logic/consoleUrls";
import { resourceGroupScope } from "../../api/azureArm";
import { getVariableDisplayName, CORP_NAME_KEYS } from "../../logic/variables";
import CloudVariableDetail from "../CloudVariableDetail";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import FieldLabel from "../../components/FieldLabel";
import StatusText from "../../components/StatusText";
import ErrorText from "../../components/ErrorText";
import type { Account, CardChrome, AzureAccount, GhEnv } from "../../types";

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
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Creates the root Azure resources — resource group, Log Analytics, Application Insights, the private storage account — then the{" "}
      <Box component="code" sx={{ fontFamily: "monospace" }}>
        {containerName}
      </Box>{" "}
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
    appInsightsName,
    containerName,
  } = infra;
  const disabled = card.locked;
  const [editingLocation, setEditingLocation] = useState(false);

  const missing: string[] = [];
  if (!corpName) missing.push(getVariableDisplayName("NAME"));
  if (!subscriptionId) missing.push("AZURE_SUBSCRIPTION_ID");
  if (!spClientId) missing.push("AZURE_CLIENT_ID");
  const ready = !!azureAccount && missing.length === 0;

  // Previously completed for this target, but the live check now shows the resource group is gone or the SP lost access.
  const rgNotFound = resultMatches && infraRbacStatus === "rg-not-found";
  const rgRbacMissing = resultMatches && infraRbacStatus === "missing-role";

  const locationDisplayName = locations.find((l) => l.name === location)?.displayName ?? location;

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
          keys={CORP_NAME_KEYS}
          variables={variables}
          title="Company short code"
          githubUrl={githubUrl}
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
            <WarningAmberIcon aria-hidden="true" sx={{ fontSize: 16, color: "warning.main", flexShrink: 0 }} />
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
            <WarningAmberIcon aria-hidden="true" sx={{ fontSize: 16, color: "warning.main", flexShrink: 0 }} />
            <Typography color="warning.dark">GitHub Actions has no access on the resource group — re-run to grant it.</Typography>
          </Box>
        )}

        {/* Planned resources */}
        {ready && steps.length === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box>
              <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Resources</Typography>
              <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
                {[
                  ["Resource group", resourceGroupName],
                  ["Log Analytics", lawName],
                  ["App Insights", appInsightsName],
                  ["Storage account", storageAccountName],
                  ["State container", containerName],
                ].map(([label, value]) => (
                  <Typography key={label} color="text.muted">
                    {label}:{" "}
                    <Box component="span" sx={{ color: "text.primary" }}>
                      {value}
                    </Box>
                  </Typography>
                ))}

                {/* Location — inline editable */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minHeight: "1.6em" }}>
                  {editingLocation ? (
                    <>
                      <FieldLabel htmlFor="core-infra-location">Location</FieldLabel>
                      {locations.length > 0 ? (
                        <Select
                          id="core-infra-location"
                          size="small"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          sx={{ minWidth: 220, "& .MuiSelect-select": { py: 0.35 } }}
                        >
                          {locations.map((locationOption) => (
                            <MenuItem key={locationOption.name} value={locationOption.name}>
                              {locationOption.displayName}{" "}
                              <Box component="span" sx={{ color: "text.muted", ml: 0.5 }}>
                                ({locationOption.name})
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      ) : (
                        <TextField
                          id="core-infra-location"
                          size="small"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder={locationsLoading ? "Loading regions..." : "e.g. australiaeast"}
                          sx={{ minWidth: 220 }}
                          className="corpTechnicalInput"
                        />
                      )}
                      {locationsLoading && <CircularProgress aria-label="Loading Azure regions" size={12} />}
                      <IconButton aria-label="Confirm Azure region" size="small" onClick={() => setEditingLocation(false)} sx={{ color: "success.main", p: 0.25 }}>
                        <CheckIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <Typography color="text.muted">
                        Location:{" "}
                          <Box component="span" sx={{ color: "text.primary" }}>
                          {locationDisplayName}
                        </Box>
                      </Typography>
                      <IconButton aria-label="Edit Azure region" size="small" onClick={() => setEditingLocation(true)} sx={{ color: "text.disabled", p: 0.25, "&:hover": { color: "primary.main" } }}>
                        <EditIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    </>
                  )}
                </Box>
                {locationsError && (
                  <ErrorText>
                    Couldn't load Azure region list — type the region name manually.
                  </ErrorText>
                )}
              </Box>
            </Box>

            <Button
              variant="contained"
              onClick={run}
              disabled={disabled || running || !location.trim()}
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
