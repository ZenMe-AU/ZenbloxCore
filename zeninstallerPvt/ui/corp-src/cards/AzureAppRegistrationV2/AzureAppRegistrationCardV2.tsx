/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState, type ReactNode } from "react";
import { Box, Button, Link, TextField, Typography, useTheme } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import AzureAccessCheck from "../../components/AzureAccessCheck";
import BaseCard from "../../components/BaseCard";
import CollapsiblePanel from "../../components/CollapsiblePanel";
import ErrorText from "../../components/ErrorText";
import FieldLabel from "../../components/FieldLabel";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import StatusText from "../../components/StatusText";
import ViewLink from "../../components/ViewLink";
import { AZURE_APP_KEYS } from "../../logic/variables";
import type { CardChrome } from "../../types";
import { AZURE_APP_REGISTRATIONS_URL, getAppRegistrationUrl } from "../AzureAppRegistration/consoleUrls";
import CloudVariableDetailV2 from "../CloudVariableDetailV2";
import StepRow from "../StepRow";
import type { UseCard } from "./useAzureAppRegistrationCardV2";

type Props = {
  cardChrome: CardChrome;
  card: UseCard;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Creates a Microsoft Entra app for GitHub Actions to use when previewing Azure changes with Terraform. The app can view resources in the selected subscription, but it can’t change them. ZenInstaller saves its ID in two settings for the selected GitHub environment. Use the remote terminal to apply changes.
    </Typography>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main", borderRadius: 1, px: 2, py: 1.25, display: "flex", gap: 1 }}
    >
      <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
      <Typography color="warning.dark">{children}</Typography>
    </Box>
  );
}

function SaveHint({ children }: { children: string }) {
  return (
    <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
      <Typography color="warning.main">{children}</Typography>
    </Box>
  );
}

function BlockedContent({ card, cardChrome }: Props) {
  const theme = useTheme();
  const colors = theme.vars.palette.card;
  return (
    <>
      <Intro />
      <Box
        role="status"
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.75,
          px: 1.75,
          py: 1.5,
          background: colors.requirementPanel,
          border: `1px solid ${theme.vars.palette.divider}`,
          borderRadius: "8px",
        }}
      >
        <Typography sx={{ typography: "body1", color: theme.vars.palette.text.secondary }}>
          The following prerequisites are incomplete.
        </Typography>
        {card.privateContext.blockedBy.map((prerequisite) => (
          <Link
            key={prerequisite.cardId}
            href={`#card-${prerequisite.cardId}`}
            onClick={() => {
              const requirement = cardChrome.requirements.find((item) => item.target === prerequisite.cardId);
              if (requirement) cardChrome.onRequirementClick(requirement.target);
            }}
            sx={{ alignSelf: "flex-start", fontWeight: 500 }}
          >
            {prerequisite.label}
          </Link>
        ))}
      </Box>
    </>
  );
}

function Action({ card }: Pick<Props, "card">) {
  const clientId = card.privateContext.spClientId;
  return (
    <ViewLink
      href={clientId ? getAppRegistrationUrl(clientId) : AZURE_APP_REGISTRATIONS_URL}
      label={clientId ? "Open app registration in Azure" : "Browse Azure app registrations"}
    />
  );
}

function Content({ card }: Pick<Props, "card">) {
  const { baseCardContext, privateContext } = card;
  const done = baseCardContext.lifecycle === "complete";
  const {
    appName,
    setAppName,
    steps,
    running,
    run,
    reset,
    rbacStatus,
    rbacMissingRoles,
    rbacError,
    planClientIdMismatch,
    managementAccess,
    github,
    variables,
    populate,
    autoSaveCounter,
    differsFromGithub,
  } = privateContext;
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);

  const varHasAny = AZURE_APP_KEYS.some((key) => !!variables.values[key]);
  // The saved app isn't in the selected tenant, or its service principal has no role on the selected subscription.
  const spNotFound = rbacStatus === "sp-not-found";
  const rbacMissing = rbacStatus === "missing-role";
  const keyErrors = spNotFound ? { AZURE_CLIENT_ID: "Not found in the selected tenant", AZURE_PLAN_CLIENT_ID: "Not found in the selected tenant" } : undefined;

  return (
    <>
      <Intro />
      {spNotFound && <Warning>This app registration doesn't exist in the selected tenant — create a new one.</Warning>}
      {rbacMissing && <Warning>Missing on the selected subscription: <b>{rbacMissingRoles.join(", ") || "access"}</b> — re-run to grant it.</Warning>}
      {planClientIdMismatch && <Warning>AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID — re-run to bring it back in sync.</Warning>}
      {!running && rbacError && <ErrorText>{rbacError}</ErrorText>}

      {steps.length === 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box>
            <FieldLabel htmlFor="azure-app-registration-v2-name">App registration name</FieldLabel>
            <TextField
              id="azure-app-registration-v2-name"
              size="small"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              sx={{ minWidth: 280 }}
              inputProps={{ "data-sensitive": true }}
            />
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              onClick={() => void run()}
              disabled={!appName.trim() || managementAccess.status !== "ready"}
              sx={{ py: 0.85, px: 2.5 }}
            >
              {rbacMissing ? "Grant Reader access on this subscription" : done ? "Re-run app registration" : "Create app registration"}
            </Button>
            {managementAccess.status === "error" && (
              <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ErrorOutlineIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "error.main" }} />
                <Typography color="error.main">Insufficient permissions to continue</Typography>
              </Box>
            )}
            {varHasAny && !done && !rbacMissing && !spNotFound && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
                <Typography color="warning.main">This replaces the saved Azure app IDs for the selected GitHub environment.</Typography>
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
          {running && <StatusText>Running...</StatusText>}
          <ProcessRetryNotice started={steps.length > 0} />
          {!running && (
            <Button size="small" onClick={reset} sx={{ alignSelf: "flex-start", mt: 0.5, color: "text.muted", "&:hover": { color: "primary.main" } }}>
              ↩ Try again
            </Button>
          )}
        </Box>
      )}

      {(managementAccess.status === "warning" || managementAccess.status === "error") && (
        <CollapsiblePanel label="Prerequisites" id="azure-app-registration-v2-prerequisites" open={prerequisitesOpen} onToggle={() => setPrerequisitesOpen((open) => !open)}>
          <AzureAccessCheck access={managementAccess} resourceAccess errorStyle />
        </CollapsiblePanel>
      )}

      {github && (
        <CloudVariableDetailV2
          key={JSON.stringify([github.account.id, github.repoName, github.envName])}
          keys={AZURE_APP_KEYS}
          variables={variables}
          populate={populate}
          autoSaveCounter={autoSaveCounter}
          keyErrors={keyErrors}
          title="Saved to GitHub"
          // Edits waiting in the draft come first; otherwise say the run's app and GitHub differ, which saving a clean draft can't fix.
          saveHint={({ dirty }) => dirty
            ? <SaveHint>Unsaved change — save to apply.</SaveHint>
            : differsFromGithub
              ? <SaveHint>Doesn't match what's saved to GitHub — run it again to save it.</SaveHint>
              : undefined}
        />
      )}
    </>
  );
}

export default function Card({ cardChrome, card }: Props) {
  const { baseCardContext } = card;
  return (
    <BaseCard
      baseCardContext={baseCardContext}
      expanded={cardChrome.expanded}
      onToggle={cardChrome.onToggle}
      action={<Action card={card} />}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {baseCardContext.lifecycle === "blocked" ? (
          <BlockedContent card={card} cardChrome={cardChrome} />
        ) : (
          <Content card={card} />
        )}
      </Box>
    </BaseCard>
  );
}
