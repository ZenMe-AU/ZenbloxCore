/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Fragment } from "react";
import { Box, Button, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import StepRow from "../cards/StepRow";
import ExternalLink from "./ExternalLink";
import { warningMessageIconSx } from "../config/styles";
import { AZURE_PIM_ACTIVATION_URL } from "../logic/consoleUrls";
import type { ResourceGroupCreationAccess as Access } from "../hooks/util/useResourceGroupCreationAccess";

export default function ResourceGroupCreationAccess({ access, resourceAccess = false }: { access: Access; resourceAccess?: boolean }) {
  // Nothing to show when every check passed — the enabled card action is the signal.
  if (access.status === "idle" || access.status === "ready") return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      {access.status === "checking" ? (
        <Box role="status" aria-live="polite">
          <StepRow step={{ id: "subscription-access", label: resourceAccess ? "Checking Azure resource access..." : "Checking subscription Contributor access...", status: "running" }} />
        </Box>
      ) : (
        <>
          <Box role="alert" sx={{
            backgroundColor: "background.default", border: "1px solid", borderColor: "warning.main",
            borderRadius: 1, px: 2, py: 1.25, minWidth: 0, overflowWrap: "anywhere",
          }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
              <Typography color="warning.dark">{resourceAccess ? "You may not have enough access to manage this card's Azure resources." : "You may not have enough subscription access to create resource groups."}</Typography>
            </Box>
            <Typography color="warning.dark" sx={{ whiteSpace: "pre-line" }}>
              {access.error?.split(AZURE_PIM_ACTIVATION_URL).map((text, index) => (
                <Fragment key={index}>
                  {index > 0 && (
                    <ExternalLink href={AZURE_PIM_ACTIVATION_URL} label="Activate an Azure resource role in PIM">
                      PIM - My roles - Azure resources
                    </ExternalLink>
                  )}
                  {text}
                </Fragment>
              ))}
            </Typography>
          </Box>
          <Button variant="contained" sx={{ mt: 1, py: 0.85, px: 2.5 }} onClick={access.retry}>
            {resourceAccess ? "Recheck resource access" : "Recheck subscription access"}
          </Button>
        </>
      )}
    </Box>
  );
}
