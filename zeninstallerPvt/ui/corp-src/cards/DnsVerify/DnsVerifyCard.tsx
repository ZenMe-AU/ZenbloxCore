/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../../config/styles";
import type { UseDnsVerifyCard } from "./useDnsVerifyCard";
import Card from "../../components/Card";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";
import type { CardChrome } from "../../types";

type Props = {
  card: CardChrome;
  dnsVerify: UseDnsVerifyCard;
  dnsName: string;
  nameServers: string[]; // From the corp domain setup, which created the zone.
};

function Intro({ dnsName }: { dnsName: string }) {
  return (
    <Typography variant="body1" color="text.secondary">
      Point <b>{dnsName || "your domain"}</b> at the Azure DNS name servers at your registrar, then verify it in Entra ID and, if you choose, make it the
      tenant's primary domain. DNS changes can take minutes to hours to reach Microsoft.
    </Typography>
  );
}

function PrimaryCheckbox({ checked, disabled, dnsName, onChange }: { checked: boolean; disabled: boolean; dnsName: string; onChange: (v: boolean) => void }) {
  return (
    <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 0.75, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ margin: 0, width: 14, height: 14 }} />
      <Typography component="span" color="text.muted">
        Set <b>{dnsName}</b> as the tenant's primary domain
      </Typography>
    </Box>
  );
}

export default function DnsVerifyCard({ card, dnsVerify, dnsName, nameServers }: Props) {
  const { checkingStatus, checkStatusError, verifiedDomains, domainVerified, isPrimary, makePrimary, setMakePrimary, verifying, done, verifyError, verify } = dnsVerify;

  return (
    <Card title="Verify DNS domain" lockedIntro={<Intro dnsName={dnsName} />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro dnsName={dnsName} />
        {checkStatusError && <ErrorText>Couldn't check the domain: {checkStatusError}</ErrorText>}
        {checkingStatus && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <CircularProgress aria-label="Checking domain" size={12} />
            <StatusText>Checking whether this domain is already verified...</StatusText>
          </Box>
        )}
        {verifiedDomains.length > 0 && (
          <Box>
            <Typography variant="sectionLabel" sx={{ mb: 0.75 }}>Verified domains in this tenant</Typography>
            <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              {verifiedDomains.map((d) => (
                <Typography key={d.name} color="text.primary">
                  {d.name}
                  {d.isDefault && (
                    <Box component="span" sx={{ color: "text.muted" }}>
                      {" "}
                      — primary
                    </Box>
                  )}
                  {d.isInitial && (
                    <Box component="span" sx={{ color: "text.muted" }}>
                      {" "}
                      — initial
                    </Box>
                  )}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Name servers + registrar instruction */}
        {nameServers.length > 0 && !domainVerified && (
          <Box
            sx={{
              backgroundColor: "background.default",
              border: "1px solid",
              borderColor: "info.main",
              borderRadius: 1,
              px: 2,
              py: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Typography color="info.dark" sx={{ fontWeight: 600 }}>Point your domain at Azure DNS</Typography>
            <Typography color="info.dark">
              At your domain registrar, replace the NS records for <b>{dnsName}</b> with the Azure name servers below. Microsoft can only verify the domain once
              DNS resolves through Azure.
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {nameServers.map((ns) => (
                <Typography key={ns} color="text.primary" sx={{ typography: "technical" }}>
                  {ns}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
        {/* Domain verification + primary promotion (one button drives both) */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {done && (
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <CheckCircleOutlineIcon aria-hidden="true" sx={{ typography: "caption", color: "success.main" }} />
              <Typography color="success.dark">
                Domain <b>{dnsName}</b> is verified{isPrimary && " and set as the primary domain"}.
              </Typography>
            </Box>
          )}
          {/* The user's call, so it stays until the domain is primary: ticking it after verifying brings back the button. */}
          {!isPrimary && <PrimaryCheckbox checked={makePrimary} disabled={verifying} dnsName={dnsName} onChange={setMakePrimary} />}
          {!done && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  onClick={verify}
                  disabled={verifying}
                  startIcon={verifying ? <CircularProgress size={12} /> : undefined}
                  sx={{
                    borderColor: "primary.light",
                    color: "primary.dark",
                    "&:hover": { borderColor: "primary.main", backgroundColor: "action.hover" },
                  }}
                >
                  {domainVerified ? "Set as primary domain" : "Verify domain now"}
                </Button>
                {!domainVerified && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
                    <Typography color="warning.main">DNS propagation can take minutes to hours</Typography>
                  </Box>
                )}
              </Box>
              {verifying && <StatusText>Verifying domain...</StatusText>}
              {verifyError && <ErrorText>{verifyError}</ErrorText>}
            </>
          )}
        </Box>
      </Box>
    </Card>
  );
}
