/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import type { PrimaryState, UseDnsVerifyCard, VerifyState } from "./useDnsVerifyCard";
import Card from "../../components/Card";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";
import { CopyButton } from "../../components/CopyRow";
import { warningMessageIconSx } from "../../config/styles";
import type { CardChrome } from "../../types";

type Props = {
  card: CardChrome;
  dnsVerify: UseDnsVerifyCard;
  dnsName: string;
};

function Intro({ dnsName }: { dnsName: string }) {
  return (
    <Typography variant="body1" color="text.secondary">
      Point <b>{dnsName || "your domain"}</b> to Azure DNS, then verify the domain in Microsoft Entra ID.
    </Typography>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardBodySx = { display: "flex", flexDirection: "column", gap: 2 } as const;
const overflowWrapSx = { overflowWrap: "anywhere" } as const;

// The tenant's verified domains, as a left-bordered list like the other cards' resource lists.
const domainListLabelSx = { mb: 0.75 } as const;
const domainListSx = { borderLeft: "2px solid", borderColor: "divider", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 } as const;
const domainTagSx = { color: "text.muted" } as const;

// The registrar instructions: an info-bordered panel holding the name server list and the propagation note.
const dnsPanelSx = {
  backgroundColor: "background.default",
  border: "1px solid",
  borderColor: "info.main",
  borderRadius: 1,
  px: 2,
  py: 1.5,
  display: "flex",
  flexDirection: "column",
  gap: 1,
} as const;
const dnsPanelHeaderSx = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 } as const;
const dnsPanelHeadingSx = { fontWeight: 600 } as const;

// Index, value and copy each keep their own column, so every row lines up; the list is only as wide as its longest value.
const nameServerListSx = { listStyle: "none", m: 0, px: 1.5, py: 0, width: "fit-content", maxWidth: "100%", backgroundColor: "background.paper", borderRadius: 0.5 } as const;
const nameServerRowSx = {
  display: "grid",
  gridTemplateColumns: "40px minmax(0, 1fr) 28px",
  columnGap: 1.5,
  alignItems: "center",
  minHeight: 30,
  "&:not(:last-of-type)": { borderBottom: "1px solid", borderColor: "divider" },
} as const;
const nameServerCopySx = { display: "flex", justifyContent: "flex-end" } as const;

const noteRowSx = { display: "flex", alignItems: "center", gap: 0.75 } as const;
const noteIconSx = { ...warningMessageIconSx, color: "text.secondary" } as const;

// Both rows share one button width, so their status icons and messages line up.
const actionListSx = { display: "flex", flexDirection: "column", gap: 1.5 } as const;
const actionRowSx = { display: "flex", alignItems: "center", gap: 1.5 } as const;
const actionButtonSx = {
  width: 180,
  flexShrink: 0,
  borderColor: "primary.light",
  color: "primary.dark",
  "&:hover": { borderColor: "primary.main", backgroundColor: "action.hover" },
} as const;
const actionStatusSx = { display: "flex", alignItems: "center", gap: 1, minWidth: 0 } as const;
const statusIconSlotSx = { display: "flex", flexShrink: 0, width: 16, justifyContent: "center" } as const;
const statusMessageSx = { minWidth: 0 } as const;

// ─── Action status ────────────────────────────────────────────────────────────

type Tone = "success" | "processing" | "warning" | "error";

const toneMessageSx = (fontWeight: number) => ({ ...overflowWrapSx, fontWeight }) as const;
const toneIconSx = (color: string) => ({ ...warningMessageIconSx, color }) as const;

// Each tone has its own icon as well as its colour, so the state never rests on colour alone; processing shows a spinner instead.
const TONE_STYLE: Record<Tone, { Icon?: typeof CheckCircleIcon; iconSx?: ReturnType<typeof toneIconSx>; textColor: string; messageSx: ReturnType<typeof toneMessageSx> }> = {
  success: { Icon: CheckCircleIcon, iconSx: toneIconSx("success.main"), textColor: "success.dark", messageSx: toneMessageSx(500) },
  processing: { textColor: "text.secondary", messageSx: toneMessageSx(400) },
  warning: { Icon: ScheduleIcon, iconSx: toneIconSx("warning.main"), textColor: "warning.dark", messageSx: toneMessageSx(400) },
  error: { Icon: CancelIcon, iconSx: toneIconSx("error.main"), textColor: "error.main", messageSx: toneMessageSx(400) },
};

type ActionStatus = { tone: Tone; message: string };

// A row with nothing to report shows only its button: verify before its first attempt, primary until it is being set (disabled until verified).
const VERIFY_STATUS: Record<VerifyState, ActionStatus | null> = {
  idle: null,
  verifying: { tone: "processing", message: "Verifying domain…" },
  awaitingPropagation: { tone: "warning", message: "Awaiting DNS propagation. Try again later." },
  verified: { tone: "success", message: "Domain verified successfully." },
  failed: { tone: "error", message: "Domain verification failed." },
};
const PRIMARY_STATUS: Record<PrimaryState, ActionStatus | null> = {
  blocked: null,
  optional: null,
  setting: { tone: "processing", message: "Setting primary domain…" },
  primary: { tone: "success", message: "Primary domain set successfully." },
  failed: { tone: "error", message: "Failed to set primary domain." },
};

// One action: its button, then the status icon and message for what it last did; a failure keeps the button for a retry.
function ActionRow({ label, onClick, disabled, status, detail }: {
  label: string; onClick: () => void; disabled: boolean; status: ActionStatus | null; detail?: string | null;
}) {
  const isError = status?.tone === "error";
  const style = status ? TONE_STYLE[status.tone] : null;
  return (
    <Box sx={actionRowSx}>
      <Button variant="outlined" onClick={onClick} disabled={disabled} sx={actionButtonSx}>
        {label}
      </Button>
      <Box role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} sx={actionStatusSx}>
        {status && style && (
          <>
            <Box sx={statusIconSlotSx}>
              {style.Icon ? <style.Icon aria-hidden="true" sx={style.iconSx} /> : <CircularProgress size={14} color="info" aria-hidden="true" />}
            </Box>
            <Box sx={statusMessageSx}>
              <Typography color={style.textColor} sx={style.messageSx}>{status.message}</Typography>
              {detail && <Typography variant="body2" color="text.secondary" sx={overflowWrapSx}>{detail}</Typography>}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

export default function DnsVerifyCard({ card, dnsVerify, dnsName }: Props) {
  const { checkingStatus, checkStatusError, verifiedDomains, domainVerified, nameServers, verifyState, verifyError, verify, primaryState, primaryError, setPrimary } = dnsVerify;

  return (
    <Card title="Verify DNS domain" lockedIntro={<Intro dnsName={dnsName} />} {...card}>
      <Box sx={cardBodySx}>
        <Intro dnsName={dnsName} />
        {checkStatusError && <ErrorText>Couldn't check the domain: {checkStatusError}</ErrorText>}
        {checkingStatus && (
          <Box sx={noteRowSx}>
            <CircularProgress aria-label="Checking domain" size={12} />
            <StatusText>Checking whether this domain is already verified...</StatusText>
          </Box>
        )}
        {verifiedDomains.length > 0 && (
          <Box>
            <Typography variant="sectionLabel" sx={domainListLabelSx}>Verified domains in this tenant</Typography>
            <Box sx={domainListSx}>
              {verifiedDomains.map((d) => (
                <Typography key={d.name} color="text.primary">
                  {d.name}
                  {d.isDefault && (
                    <Box component="span" sx={domainTagSx}>
                      {" "}
                      — primary
                    </Box>
                  )}
                  {d.isInitial && (
                    <Box component="span" sx={domainTagSx}>
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
          <Box sx={dnsPanelSx}>
            <Box sx={dnsPanelHeaderSx}>
              <Typography color="info.dark" sx={dnsPanelHeadingSx}>Point your domain at Azure DNS</Typography>
              <CopyButton label="all name servers" value={nameServers.join("\n")} text="Copy all" />
            </Box>
            <Typography color="text.secondary">
              At your domain registrar, replace the name servers for <b>{dnsName}</b> with the Azure name servers below.
            </Typography>
            <Box component="ul" aria-label="Azure name servers" sx={nameServerListSx}>
              {nameServers.map((ns, index) => (
                <Box component="li" key={ns} sx={nameServerRowSx}>
                  <Typography variant="body2" color="text.muted">NS {index + 1}</Typography>
                  <Typography variant="technicalBody" color="text.primary" sx={overflowWrapSx}>
                    {ns}
                  </Typography>
                  <Box sx={nameServerCopySx}>
                    <CopyButton label={`name server ${ns}`} value={ns} iconOnly />
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={noteRowSx}>
              <InfoOutlinedIcon aria-hidden="true" sx={noteIconSx} />
              <Typography color="text.secondary">DNS propagation can take minutes to hours.</Typography>
            </Box>
          </Box>
        )}
        <Box sx={actionListSx}>
          <ActionRow
            label="Verify domain now"
            onClick={verify}
            disabled={verifyState === "verifying" || verifyState === "verified"}
            status={VERIFY_STATUS[verifyState]}
            detail={verifyState === "failed" ? verifyError : null}
          />
          <ActionRow
            label="Set as primary domain"
            onClick={setPrimary}
            disabled={primaryState !== "optional" && primaryState !== "failed"}
            status={PRIMARY_STATUS[primaryState]}
            detail={primaryState === "failed" ? primaryError : null}
          />
        </Box>
      </Box>
    </Card>
  );
}
