/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Fragment } from "react";
import { Box, Button, Typography } from "@mui/material";
import StepRow from "../cards/StepRow";
import Caption from "./Caption";
import ExternalLink from "./ExternalLink";
import WarningNotice from "./WarningNotice";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import type { ResourceGroupCreationAccess } from "../hooks/util/useAzureAccessCheck";
import type { CardResourceAccess } from "../hooks/util/useAzureCardAccess";

type Access = ResourceGroupCreationAccess & Partial<Pick<CardResourceAccess,
  "missingRoles" | "missingEntra" | "unregisteredProviders" | "registeringProviders" | "registerProviders" | "missingConsent" | "grantConsent">>;

const noticeButtonSx = { alignSelf: "flex-start", minWidth: 0, px: 1 } as const;

// The text with the PIM activation URL turned into a link.
// TODO: find the authorization from the sign-in data instead.
const withPimLink = (text: string) => text.split(AZURE_PIM_ACTIVATION_URL).map((part, index) => (
  <Fragment key={index}>
    {index > 0 && (
      <ExternalLink href={AZURE_PIM_ACTIVATION_URL} label="Activate an Azure resource role in PIM">
        PIM - My roles - Azure resources
      </ExternalLink>
    )}
    {part}
  </Fragment>
));

export default function AzureAccessCheck({ access, resourceAccess = false, errorStyle = false }: { access: Access; resourceAccess?: boolean; errorStyle?: boolean }) {
  const { missingRoles, missingEntra, unregisteredProviders = [], registeringProviders = false, registerProviders, missingConsent = [], grantConsent } = access;
  switch (access.status) {
    // Nothing to show when every check passed — the enabled card action is the signal.
    case "idle":
    case "ready":
      return null;
    case "checking":
      return (
        <Box role="status" aria-live="polite" sx={{ minWidth: 0 }}>
          <StepRow step={{ id: "subscription-access", label: resourceAccess ? "Checking Azure resource access..." : "Checking subscription Contributor access...", status: "running" }} />
        </Box>
      );
    // The check ran and found something missing: a warning box and a button for each kind, all at once.
    case "warning":
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          {!!missingConsent.length && grantConsent && (
            <WarningNotice message="This card needs your consent for these permissions.">
              <Caption>{missingConsent.join(", ")}</Caption>
              <Button size="small" variant="outlined" onClick={grantConsent} sx={noticeButtonSx}>Grant consent</Button>
            </WarningNotice>
          )}
          {!!unregisteredProviders.length && registerProviders && (
            <WarningNotice message="These Azure resource providers aren't registered in this subscription yet.">
              <Caption>{unregisteredProviders.join(", ")}</Caption>
              <Button size="small" variant="outlined" onClick={() => void registerProviders()} disabled={registeringProviders}
                aria-busy={registeringProviders} sx={noticeButtonSx}>
                {registeringProviders ? "Registering..." : "Register providers"}
              </Button>
            </WarningNotice>
          )}
          {missingEntra && (
            <WarningNotice message={<Box component="span" sx={{ whiteSpace: "pre-line" }}>{missingEntra}</Box>}>
              <Button size="small" variant="outlined" onClick={access.retry} sx={noticeButtonSx}>Recheck Entra roles</Button>
            </WarningNotice>
          )}
          {missingRoles && (
            <WarningNotice message={<Box component="span" sx={{ whiteSpace: "pre-line" }}>{withPimLink(missingRoles)}</Box>}>
              <Button size="small" variant="outlined" onClick={access.retry} sx={noticeButtonSx}>Recheck resource access</Button>
            </WarningNotice>
          )}
        </Box>
      );
    // The check couldn't run.
    case "error":
      return (
        <Box sx={{ minWidth: 0 }}>
          <Box role="alert" sx={{
            backgroundColor: "background.default", border: "1px solid", borderColor: errorStyle ? "error.main" : "warning.main",
            borderRadius: 1, px: 2, py: 1.25, minWidth: 0, overflowWrap: "anywhere",
          }}>
            <Typography color={errorStyle ? "error.main" : "warning.dark"} sx={{ whiteSpace: "pre-line" }}>
              {withPimLink(access.error ?? "")}
            </Typography>
          </Box>
          <Button variant="contained" sx={{ mt: 1, py: 0.85, px: 2.5 }} onClick={access.retry}>
            {resourceAccess ? "Recheck resource access" : "Recheck subscription access"}
          </Button>
        </Box>
      );
  }
}
