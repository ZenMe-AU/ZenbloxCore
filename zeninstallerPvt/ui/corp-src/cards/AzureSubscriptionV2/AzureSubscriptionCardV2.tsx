/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, CircularProgress, Link, MenuItem, Select, Typography, useTheme } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import BaseCard from "../../components/BaseCard";
import FieldLabel from "../../components/FieldLabel";
import ViewLink from "../../components/ViewLink";
import { AZURE_SUBSCRIPTIONS_URL, getAzureSubscriptionUrl } from "../../logic/consoleUrls";
import { AZURE_TARGET_KEYS } from "../../logic/variables";
import type { CardChrome } from "../../types";
import CloudVariableDetailV2 from "../CloudVariableDetailV2";
import { azureLoginCardId } from "./stateMachine";
import type { UseCard } from "./useAzureSubscriptionCardV2";

type Props = {
  cardChrome: CardChrome;
  card: UseCard;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary">
      Pick the subscription to deploy into. This is where the resource group, storage account and DNS zone will be created, and it's saved to GitHub so the
      pipeline uses the same target.
    </Typography>
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
            component="button"
            type="button"
            onClick={() => cardChrome.onRequirementClick(prerequisite.cardId)}
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
  const { selectedSubscriptionId: subscriptionId, tenantId } = card.privateContext;
  return (
    <ViewLink
      href={subscriptionId ? getAzureSubscriptionUrl(tenantId ?? undefined, subscriptionId) : AZURE_SUBSCRIPTIONS_URL}
      label={subscriptionId ? "Open Azure subscription" : "Browse Azure subscriptions"}
    />
  );
}

function Content({ card, cardChrome }: Props) {
  const { baseCardContext, privateContext } = card;
  const { tenantId, subscriptions, selectedSubscriptionId, setSelectedSubscriptionId, subsError, github } = privateContext;
  const lifecycle = baseCardContext.lifecycle;
  const openAzureLogin = () => cardChrome.onRequirementClick(azureLoginCardId);

  return (
    <>
      <Intro />
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        <Typography color="text.muted">
          Tenant: <Box component="span" data-sensitive="true" sx={{ color: "text.primary" }}>{tenantId}</Box>
        </Typography>
        <Link component="button" type="button" onClick={openAzureLogin} sx={{ py: 0, px: 0.5, textAlign: "left" }}>
          Change on Azure login 2 →
        </Link>
      </Box>

      <Box>
        <FieldLabel id="azure-subscription-v2-label" htmlFor="azure-subscription-v2-select">Subscription</FieldLabel>
        {lifecycle === "loading" ? (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress aria-label="Loading Azure subscriptions" size={12} sx={{ color: "text.disabled" }} />
            <Typography color="text.muted">Loading subscriptions...</Typography>
          </Box>
        ) : lifecycle === "error" ? (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
            <Typography color="warning.main">{subsError}</Typography>
          </Box>
        ) : (
          <Select
            id="azure-subscription-v2-select"
            aria-labelledby="azure-subscription-v2-label"
            size="small"
            value={selectedSubscriptionId}
            displayEmpty
            renderValue={(value) => {
              if (!value) return <Typography color="text.muted">Select a subscription</Typography>;
              const name = subscriptions.find((option) => option.id === value)?.displayName ?? value;
              return <Typography data-sensitive="true">{name}</Typography>;
            }}
            sx={{ minWidth: { xs: 0, sm: 380 }, width: "100%" }}
          >
            {subscriptions.map((option) => (
              // onClick rather than the Select's onChange, which skips picking the subscription already selected.
              <MenuItem key={option.id} value={option.id} onClick={() => setSelectedSubscriptionId(option.id)} sx={{ py: 0.75 }}>
                <Box>
                  <Typography data-sensitive="true">{option.displayName}</Typography>
                  <Typography data-sensitive="true" variant="body2" color="text.muted">{option.id}</Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        )}
      </Box>

      {github && (
        <CloudVariableDetailV2
          key={JSON.stringify([github.account.id, github.repoName, github.envName])}
          keys={AZURE_TARGET_KEYS}
          variables={privateContext.variables}
          populate={privateContext.populate}
          populateCounter={privateContext.populateCount}
          preserveDirtyOnSync
          hiddenKeys={["VITE_AZURE_TENANT_ID"]}
          title="Saved to GitHub"
          // Edits waiting in the draft come first; otherwise say the pick and GitHub differ, which saving a clean draft can't fix.
          saveHint={({ dirty }) => dirty
            ? <SaveHint>Unsaved change — save to apply.</SaveHint>
            : privateContext.differsFromGithub
              ? <SaveHint>Doesn't match what's saved to GitHub — pick the subscription again, then save.</SaveHint>
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
          <Content card={card} cardChrome={cardChrome} />
        )}
      </Box>
    </BaseCard>
  );
}
