/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, MenuItem, Select, TextField, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import BaseCard from "../../components/BaseCard";
import ViewLink from "../../components/ViewLink";
import { getEntraOverviewUrl } from "../../logic/consoleUrls";
import ConfigErrorNotice from "../../components/ConfigErrorNotice";
import ErrorText from "../../components/ErrorText";
import ExternalLink from "../../components/ExternalLink";
import FieldLabel from "../../components/FieldLabel";
import StatusText from "../../components/StatusText";
import type { CardChrome } from "../../types";
import type { UseAzureLoginCardV2 } from "./useAzureLoginCardV2";
import { tenantDisplayName } from "../../logic/tenant";
import { stateGraph } from "./stateMachine";

// The same links as AzureLogin's config, kept here so this card does not depend on that folder.
const CREATE_ACCOUNT_URL = `${import.meta.env.VITE_DOCS_URL ?? ""}/Creating_AZURE_account`;
const TENANT_ID_URL = "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview";

type Props = {
  cardChrome: CardChrome;
  azureLogin: UseAzureLoginCardV2;
};

function Intro() {
  return (
    <Typography component="p" variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Sign in with a Microsoft account that can access the Entra tenant you want to configure. Choose the tenant here, then select an Azure subscription on the
      next card. ZenInstaller uses your sign-in to create the app registrations and cloud resources you request. Microsoft handles your password; your
      authentication token stays in this browser session and is not stored on ZenInstaller's servers.
    </Typography>
  );
}

function Action() {
  return <ViewLink href={getEntraOverviewUrl()} label="Open Entra tenant overview" />;
}

function AzureLoginContent({ azureLogin }: { azureLogin: UseAzureLoginCardV2 }) {
  const {
    account: azureAccount,
    loggingIn,
    loginError,
    login,
    logout,
    redirecting,
    tenants,
    manualTenantId,
    setManualTenantId,
    selectTenant,
    confirming,
    tenantIdError,
    tenantsLoaded,
    tenantPinned,
  } = azureLogin;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Intro />

      {!azureAccount ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {loggingIn ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} color="primary" aria-hidden="true" />
              <StatusText>Checking session...</StatusText>
            </Box>
          ) : (
            <>
              <Button
                variant="contained"
                onClick={login}
                disabled={redirecting}
                startIcon={redirecting ? <CircularProgress size={14} sx={{ color: "text.disabled" }} /> : undefined}
                sx={{ alignSelf: "flex-start" }}
              >
                {redirecting ? "Connecting..." : "Sign in with Azure"}
              </Button>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                <Typography variant="body1" color="text.muted">To create a new Azure account, follow this guide:</Typography>
                <ExternalLink href={CREATE_ACCOUNT_URL} label="How to create a free Azure account">
                  <>
                    How to create a free Azure account <OpenInNewIcon fontSize="inherit" />
                  </>
                </ExternalLink>
                <Typography variant="body1" color="text.muted">A payment method is required for verification; you are not charged unless you upgrade to Pay As You Go.</Typography>
              </Box>
            </>
          )}
          {loginError && <ErrorText>{loginError}</ErrorText>}
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Signed in as{" "}
              <Box component="span" data-sensitive="true" sx={{ color: "success.main", fontWeight: 600 }}>
                {azureAccount.username}
              </Box>
            </Typography>
            {/* A confirmation still in flight would put the account back after signing out. */}
            <Button
              size="small"
              onClick={logout}
              disabled={confirming}
              variant="contained"
              color="error"
              sx={{ minWidth: 0, py: 0.25 }}
            >
              Sign out
            </Button>
          </Box>

          {/* Tenant */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.75 }}>
              <FieldLabel id="azure-tenant-v2-label" htmlFor="azure-tenant-v2-select" sx={{ mb: 0 }}>
                Tenant
              </FieldLabel>
              {!tenantPinned && (
                <ExternalLink href={TENANT_ID_URL} label="Find your Tenant ID in Microsoft Entra">
                  <>
                    Find your Tenant ID in Microsoft Entra <OpenInNewIcon fontSize="inherit" />
                  </>
                </ExternalLink>
              )}
            </Box>

            {!tenantsLoaded ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
                <CircularProgress size={16} color="inherit" aria-hidden="true" />
                <StatusText>Loading tenants...</StatusText>
              </Box>
            ) : tenants.length > 0 ? (
              <Select
                disabled={tenantPinned || confirming}
                id="azure-tenant-v2-select"
                labelId="azure-tenant-v2-label"
                data-sensitive="true"
                size="small"
                value={manualTenantId || ""}
                onChange={(event) => selectTenant(event.target.value)}
                displayEmpty
                renderValue={(value) => {
                  if (!value) return <Typography variant="body1" color="text.muted">Select a tenant</Typography>;
                  return <Typography variant="body1">{tenantDisplayName(tenants, value)}</Typography>;
                }}
                sx={{ minWidth: { xs: 0, sm: 380 }, width: "100%" }}
              >
                {tenants.map((tenant) => (
                  <MenuItem key={tenant.tenantId} value={tenant.tenantId} sx={{ py: 0.75 }}>
                    <Box>
                      <Typography variant="body1">{tenant.displayName}</Typography>
                      <Typography variant="body1" data-sensitive="true" color="text.muted">
                        {tenant.tenantId}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            ) : (
              <Box
                component="form"
                // A real submit lets the browser record the value, so it offers it back next time.
                onSubmit={(event) => {
                  event.preventDefault();
                  selectTenant(manualTenantId);
                }}
                sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}
              >
                <TextField
                  size="small"
                  name="azure-tenant"
                  id="azure-tenant-v2-select"
                  autoComplete="on"
                  placeholder="Tenant ID"
                  value={manualTenantId}
                  onChange={(event) => setManualTenantId(event.target.value)}
                  sx={{ minWidth: { xs: 0, sm: 320 }, width: "100%" }}
                  className="corpTechnicalInput"
                />
                <Button variant="contained" size="small" type="submit" disabled={!manualTenantId.trim() || confirming}>
                  Confirm tenant
                </Button>
              </Box>
            )}
            {tenantIdError && (
              <Box sx={{ mt: 0.75 }}>
                <ErrorText>{tenantIdError}</ErrorText>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function AzureLoginCardV2({ cardChrome, azureLogin }: Props) {
  const unconfigured = azureLogin.machineLifecycle === "unconfigured";
  return (
    <BaseCard
      baseCardContext={azureLogin.baseCardContext}
      expanded={cardChrome.expanded}
      onToggle={cardChrome.onToggle}
      stateDiagram={{ graph: stateGraph, currentState: azureLogin.machineLifecycle }}
      descriptionId={unconfigured ? "azure-login-v2-config-error" : undefined}
      action={unconfigured ? undefined : <Action />}
    >
      {unconfigured ? (
        <>
          <Intro />
          <ConfigErrorNotice id="azure-login-v2-config-error" />
        </>
      ) : (
        <AzureLoginContent azureLogin={azureLogin} />
      )}
    </BaseCard>
  );
}
