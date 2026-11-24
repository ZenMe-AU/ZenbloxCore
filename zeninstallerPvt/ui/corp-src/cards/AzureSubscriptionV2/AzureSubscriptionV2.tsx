/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, Link, MenuItem, Select, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { AppContext } from "../../appContext";
import { warningMessageIconSx } from "../../config/styles";
import BaseCard from "../../components/BaseCard";
import FieldLabel from "../../components/FieldLabel";
import ViewLink from "../../components/ViewLink";
import { AZURE_SUBSCRIPTIONS_URL, getAzureSubscriptionUrl } from "../../logic/consoleUrls";
import { AZURE_TARGET_KEYS } from "../../logic/variables";
import CloudVariableDetailV2 from "../CloudVariableDetailV2";
import { azureLoginCardId } from "./stateMachine";
import { useAzureSubscriptionV2, type UseAzureSubscriptionV2 } from "./useAzureSubscriptionV2";

type Props = {
  appCtxStore: AppContext;
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

function Action({ subscriptionId, tenantId }: { subscriptionId: string; tenantId: string | null }) {
  return (
    <ViewLink
      href={subscriptionId ? getAzureSubscriptionUrl(tenantId ?? undefined, subscriptionId) : AZURE_SUBSCRIPTIONS_URL}
      label={subscriptionId ? "Open Azure subscription" : "Browse Azure subscriptions"}
    />
  );
}

function TenantSection({ tenantId }: Pick<UseAzureSubscriptionV2["privateContext"], "tenantId">) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
      <Typography color="text.muted">
        Tenant: <Box component="span" data-sensitive="true" sx={{ color: "text.primary" }}>{tenantId}</Box>
      </Typography>
      <Link component="a" href={`#card-${azureLoginCardId}`} sx={{ py: 0, px: 0.5, textAlign: "left" }}>
        Change on Azure login 2 →
      </Link>
    </Box>
  );
}

function SubscriptionSection({ baseCardContext, privateContext }: UseAzureSubscriptionV2) {
  const {
    subscriptions,
    subscriptionsRefreshing,
    subscriptionsRefreshError,
    refreshSubscriptions,
    selectedSubscriptionId,
    setSelectedSubscriptionId,
    subsError,
  } = privateContext;
  const currentState = baseCardContext.stateMachine?.currentState;
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <FieldLabel id="azure-subscription-v2-label" htmlFor="azure-subscription-v2-select">Subscription</FieldLabel>
        <Button
          size="small"
          disabled={subscriptionsRefreshing}
          onClick={() => void refreshSubscriptions()}
        >
          {subscriptionsRefreshing ? "Refreshing..." : "Refresh subscriptions"}
        </Button>
      </Box>
      {currentState === "error" ? (
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
      {subscriptionsRefreshError && (
        <Typography role="status" color="warning.main" sx={{ mt: 0.75 }}>
          {subscriptionsRefreshError} The existing list is still available.
        </Typography>
      )}
    </Box>
  );
}

function SavedGitHubSection({ privateContext }: Pick<UseAzureSubscriptionV2, "privateContext">) {
  const { github, variables, populate, populateCount, differsFromGithub } = privateContext;
  if (!github) return null;

  return (
    <CloudVariableDetailV2
      key={JSON.stringify([github.account.id, github.repoName, github.envName])}
      keys={AZURE_TARGET_KEYS}
      variables={variables}
      populate={populate}
      populateCounter={populateCount}
      preserveDirtyOnSync
      hiddenKeys={["VITE_AZURE_TENANT_ID"]}
      title="Saved to GitHub"
      saveHint={({ dirty }) => dirty
        ? <SaveHint>Unsaved change — save to apply.</SaveHint>
        : differsFromGithub
          ? <SaveHint>Doesn't match what's saved to GitHub — pick the subscription again, then save.</SaveHint>
          : undefined}
    />
  );
}

export function CardContentMain({ baseCardContext, privateContext }: UseAzureSubscriptionV2) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Intro />
      <TenantSection tenantId={privateContext.tenantId} />
      <SubscriptionSection baseCardContext={baseCardContext} privateContext={privateContext} />
      <SavedGitHubSection privateContext={privateContext} />
    </Box>
  );
}

function CardEntrypoint({ appCtxStore }: Props) {
  const cardHook = useAzureSubscriptionV2(appCtxStore);
  const { baseCardContext, privateContext } = cardHook;
  return (
    <BaseCard
      baseCardContext={baseCardContext}
      appContext={privateContext.appContext}
      blockedIntro={<Intro />}
      action={<Action subscriptionId={privateContext.selectedSubscriptionId} tenantId={privateContext.tenantId} />}
    >
      <CardContentMain baseCardContext={baseCardContext} privateContext={privateContext} />
    </BaseCard>
  );
}

export default CardEntrypoint;
