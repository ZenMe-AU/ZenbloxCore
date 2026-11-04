/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect } from "react";
import { Box, Button, CircularProgress, MenuItem, Select, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import { useCards } from "../../hooks/useCards";
import { useAzureSession, useGithubSession, useUrlRestoreStatus } from "../../session";
import { INITIAL_URL_PARAMS } from "../../hooks/useUrlStateManager";
import { tenantDisplayName } from "../../logic/tenant";
import { AZURE_TARGET_KEYS } from "../../logic/variables";
import CloudVariableDetail from "../../components/CloudVariableDetail";
import Card from "../../components/Card";
import FieldLabel from "../../components/FieldLabel";
import ViewLink from "../../components/ViewLink";
import { AZURE_SUBSCRIPTIONS_URL, getAzureSubscriptionUrl } from "../../logic/consoleUrls";

function Intro() {
  return (
    <>
      Pick the subscription to deploy into. This is where the resource group, storage account and DNS zone will be created, and it's saved to GitHub so the
      pipeline uses the same target.
    </>
  );
}

/*
 * Picks the subscription the corp resources go into, and saves AZURE_TENANT_ID +
 * AZURE_SUBSCRIPTION_ID to the environment's GitHub variables. The tenant itself is
 * chosen on the Azure login card — this card only ever renders once that's done, since
 * it's locked behind "azure_login" until a tenant is confirmed. Lives in the Target
 * group; the selection is fed to the infra, domain, and app-registration cards.
 */
function Action({ subscriptionId, tenantId }: { subscriptionId: string; tenantId?: string }) {
  return <ViewLink href={subscriptionId ? getAzureSubscriptionUrl(tenantId, subscriptionId) : AZURE_SUBSCRIPTIONS_URL} />;
}

export default function AzureSubscriptionCard() {
  const { login: azure, subscription } = useAzureSession();
  const { account: githubAccount, repoName, selectedEnv, variables, githubUrl } = useGithubSession();
  const { openCard } = useCards();
  const urlRestore = useUrlRestoreStatus();
  // The tenant itself is picked on the Azure login card.
  const onOpenAzureLogin = () => openCard("azure_login");
  // A genuine manual subscription pick cancels a pending URL restore.
  const onUserInteract = () => urlRestore.cancel(["tenant", "subscription"]);
  const { tenants, manualTenantId } = azure;
  const { subscriptions, selectedSubscriptionId, setSelectedSubscriptionId, subsError, subscriptionDrift, subscriptionNoAccess } = subscription;

  // Pre-select subscription from the saved AZURE_SUBSCRIPTION_ID once its list is loaded — unless
  // a URL restore is trying to apply a (possibly different) ?subscription= value, which should win.
  useEffect(() => {
    if (selectedSubscriptionId || subscriptions.length === 0) return;
    if (INITIAL_URL_PARAMS.has("subscription")) return;
    const saved = variables.values.AZURE_SUBSCRIPTION_ID;
    if (saved && subscriptions.some((s) => s.id === saved)) setSelectedSubscriptionId(saved);
  }, [subscriptions, selectedSubscriptionId, variables.values, setSelectedSubscriptionId]);

  // Once the current tenant's subscriptions are known, a selection that doesn't belong to it (e.g. left
  // over from a different tenant) is invalid — clear it rather than let it silently stay "selected".
  useEffect(() => {
    if (!selectedSubscriptionId || subscriptions.length === 0) return;
    if (!subscriptions.some((s) => s.id === selectedSubscriptionId)) setSelectedSubscriptionId("");
  }, [subscriptions, selectedSubscriptionId, setSelectedSubscriptionId]);

  // The build bakes VITE_AZURE_TENANT_ID in to pin sign-in to this tenant, so it tracks the same choice.
  const populate = {
    AZURE_TENANT_ID: manualTenantId,
    AZURE_SUBSCRIPTION_ID: selectedSubscriptionId,
    VITE_AZURE_TENANT_ID: manualTenantId,
  };
  const tenantLabel = tenantDisplayName(tenants, manualTenantId);
  const subscriptionOptions = subscriptions.filter((s) => s.tenantId === manualTenantId);

  return (
    <Card
      face={subscription}
      action={<Action subscriptionId={selectedSubscriptionId} tenantId={azure.confirmedTenantId ?? undefined} />}
      intro={<Intro />}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <Typography color="text.muted">
            Tenant: <Box component="span" sx={{ color: "text.primary" }}>{tenantLabel}</Box>
          </Typography>
          <Button
            size="small"
            onClick={onOpenAzureLogin}
            sx={{
              minWidth: 0,
              color: "primary.main",
              py: 0,
              px: 0.5,
              "&:hover": { textDecoration: "underline" },
            }}
          >
            Change on Azure login →
          </Button>
        </Box>

        {subsError && !subscriptionNoAccess && <Typography color="error.main" role="alert">{subsError}</Typography>}

        {/* Subscription */}
        <Box>
          <FieldLabel id="azure-subscription-label" htmlFor="azure-subscription-select">Subscription</FieldLabel>
          {subscriptionOptions.length > 0 ? (
            <Select
              id="azure-subscription-select"
              aria-labelledby="azure-subscription-label"
              size="small"
              value={selectedSubscriptionId || ""}
              onChange={(e) => {
                onUserInteract();
                setSelectedSubscriptionId(e.target.value);
              }}
              displayEmpty
              renderValue={(v) => {
                if (!v) return <Typography color="text.muted">Select a subscription</Typography>;
                const name = subscriptionOptions.find((s) => s.id === v)?.displayName ?? v;
                return (
                  <Typography data-sensitive="true">
                    {name}
                  </Typography>
                );
              }}
              sx={{ minWidth: { xs: 0, sm: 380 }, width: "100%" }}
            >
              {subscriptionOptions.map((s) => (
                <MenuItem key={s.id} value={s.id} sx={{ py: 0.75 }}>
                  <Box>
                    <Typography data-sensitive="true">
                      {s.displayName}
                    </Typography>
                    <Typography data-sensitive="true" variant="body2" color="text.muted">
                      {s.id}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          ) : subscriptionNoAccess ? (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
              <Typography color="warning.main">This tenant has no subscriptions you can access.</Typography>
            </Box>
          ) : (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress aria-label="Loading Azure subscriptions" size={12} sx={{ color: "text.disabled" }} />
              <Typography color="text.muted">Loading subscriptions...</Typography>
            </Box>
          )}
        </Box>

        {!selectedEnv && (
          <Typography color="warning.main" role="status">
            Select a repository & environment to save the tenant and subscription to GitHub.
          </Typography>
        )}

        {/* Save AZURE_TENANT_ID + AZURE_SUBSCRIPTION_ID to the env's GitHub variables */}
        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={AZURE_TARGET_KEYS}
          variables={variables}
          populate={populate}
          hiddenKeys={["VITE_AZURE_TENANT_ID"]}
          title="Saved to GitHub"
          githubUrl={githubUrl}
          saveHint={
            subscriptionDrift ? (
              <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
                <Typography color="warning.main">Unsaved change — save to apply.</Typography>
              </Box>
            ) : undefined
          }
        />
      </Box>
    </Card>
  );
}
