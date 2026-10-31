/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, MenuItem, Select, TextField, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { CLOUD_DOCS } from "./config";
import Card from "../../components/Card";
import ViewLink from "../../components/ViewLink";
import { getEntraOverviewUrl } from "../../logic/consoleUrls";
import ConfigErrorNotice from "../../components/ConfigErrorNotice";
import ErrorText from "../../components/ErrorText";
import ExternalLink from "../../components/ExternalLink";
import FieldLabel from "../../components/FieldLabel";
import StatusText from "../../components/StatusText";
import type { CardChrome } from "../../types";
import type { UseAzureLoginCard } from "./useAzureLoginCard";
import { tenantDisplayName } from "../../logic/tenant";

type Props = {
  card: CardChrome;
  azureLogin: UseAzureLoginCard;
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

/*
 * Azure sign-in on its own — independent of GitHub, not gated by environment.
 * App-registration, domain, and terraform cards all reuse the session it establishes.
 */
function Action() {
  return <ViewLink href={getEntraOverviewUrl()} label="Open Entra tenant overview" />;
}

export default function AzureLoginCard({ card, azureLogin }: Props) {
  if (card.status === "unavailable") {
    return (
      <Card title="Azure login" lockedIntro={<Intro />} {...card}>
        <ConfigErrorNotice />
      </Card>
    );
  }

  const {
    account: azureAccount,
    loggingIn,
    loginError,
    login,
    logout,
    tenants,
    manualTenantId,
    setManualTenantId,
    selectTenant,
    tenantIdError,
    savedTenantId,
    tenantsLoaded,
    tenantPinned,
  } = azureLogin;

  // A tenant list was fetched, but the saved tenant doesn't appear in it — an error, not just a warning.
  const savedTenantNotInList = !!savedTenantId && manualTenantId === savedTenantId && tenants.length > 0 && !tenants.some((t) => t.tenantId === savedTenantId);

  return (
    <Card title="Azure login" action={<Action />} lockedIntro={<Intro />} {...card}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
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
                  sx={{ alignSelf: "flex-start" }}
                >
                  Sign in with Azure
                </Button>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                  <Typography variant="body1" color="text.muted">To create a new Azure account, follow this guide:</Typography>
                  <ExternalLink href={CLOUD_DOCS.azure.createAccount} label="How to create a free Azure account">
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
                <Box component="span" data-sensitive="true" data-id="txtAzureUsername" sx={{ color: "success.main", fontWeight: 600 }}>
                  {azureAccount.username}
                </Box>
              </Typography>
              <Button
                size="small"
                onClick={logout}
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
                <FieldLabel id="azure-tenant-label" htmlFor="azure-tenant-select" sx={{ mb: 0 }}>
                  Tenant
                </FieldLabel>
                {/* Only tells you how to find a tenant to type in, which a pinned tenant makes moot. */}
                {!tenantPinned && (
                  <ExternalLink href={CLOUD_DOCS.azure.urlGetTenantId} label="Find your Tenant ID in Microsoft Entra">
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
                // Fetched (or MSA-fallback) list available — plain dropdown, picking loads that tenant immediately.
                <Select
                  // Pinned at build time: the value is shown but is not the user's to change.
                  disabled={tenantPinned}
                  id="azure-tenant-select"
                  labelId="azure-tenant-label"
                  data-id="tenant-select"
                  data-sensitive="true"
                  size="small"
                  value={manualTenantId || ""}
                  onChange={(e) => selectTenant(e.target.value)}
                  displayEmpty
                  renderValue={(v) => {
                    if (!v) return <Typography variant="body1" color="text.muted">Select a tenant</Typography>;
                    return <Typography variant="body1">{tenantDisplayName(tenants, v)}</Typography>;
                  }}
                  sx={{ minWidth: { xs: 0, sm: 380 }, width: "100%" }}
                >
                  {tenants.map((t) => (
                    <MenuItem
                      key={t.tenantId}
                      value={t.tenantId}
                      sx={{ py: 0.75 }}
                      data-id="tenant-option"
                      // data-sensitive="true"
                      data-tenant-name={t.displayName}
                    >
                      <Box>
                        <Typography variant="body1">{t.displayName}</Typography>
                        <Typography variant="body1" data-sensitive="true" color="text.muted">
                          {t.tenantId}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                // Nothing fetched yet (e.g. personal account with no cached tenant) — type one in directly.
                <Box
                  component="form"
                  // A real submit lets the browser record the value, so it offers it back next time.
                  onSubmit={(e) => {
                    e.preventDefault();
                    selectTenant(manualTenantId);
                  }}
                  sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}
                >
                  <TextField
                    size="small"
                    name="azure-tenant"
                    id="azure-tenant-select"
                    autoComplete="on"
                    placeholder="Tenant ID"
                    value={manualTenantId}
                    onChange={(e) => setManualTenantId(e.target.value)}
                    sx={{ minWidth: { xs: 0, sm: 320 }, width: "100%" }}
                      className="corpTechnicalInput"
                    helperText={tenants.length > 0 ? tenantDisplayName(tenants, manualTenantId) : undefined}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    type="submit"
                    disabled={!manualTenantId.trim()}
                  >
                    Confirm tenant
                  </Button>
                </Box>
              )}
              {savedTenantNotInList ? (
                <Box sx={{ mt: 0.75 }}>
                  <ErrorText>Saved tenant not found — please pick another.</ErrorText>
                </Box>
              ) : (
                tenantIdError && (
                  <Box sx={{ mt: 0.75 }}>
                    <ErrorText>{tenantIdError}</ErrorText>
                  </Box>
                )
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Card>
  );
}
