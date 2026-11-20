/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, ButtonBase, Checkbox, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Card from "../../components/Card";
import ErrorText from "../../components/ErrorText";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import AzureAccessCheck from "../../components/AzureAccessCheck";
import Prerequisites from "../../components/Prerequisites";
import StatusText from "../../components/StatusText";
// import WarningNotice from "../../components/WarningNotice"; // Deprecated: only the commented-out consent notice used it; kept for reference.
import StepRow from "../StepRow";
import { warningMessageIconSx } from "../../config/styles";
import type { CardChrome } from "../../types";
import { ADMIN_GROUPS, CREATE_ADMIN_USERS_TITLE, PIM_OPTION } from "./config";
import type { UseCreateAdminUsersCard } from "./useCreateAdminUsersCard";
import AdminUserRow from "./AdminUserRow";
import ExistingAdminRow from "./ExistingAdminRow";
import LicenceOption from "./LicenceOption";
import SecurityGroupRow from "./SecurityGroupRow";
import { box, circle, header } from "./styles";

type Props = {
  card: CardChrome;
  adminUsers: UseCreateAdminUsersCard;
};

const INTRO_POINTS = [
  "Creates the security groups and their roles.",
  "Each admin gets a cloud-only user account and a privileged adm_ account.",
  "Needs Global Administrator in Entra, and Owner or User Access Administrator on the subscription and the tenant root management group.",
];

function Intro() {
  return (
    <Box>
      <Typography variant="body1" color="text.secondary">
        Sets up your organisation's admin groups and accounts in Entra.
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 3, color: "text.secondary" }}>
        {INTRO_POINTS.map((point) => (
          <Typography key={point} component="li" variant="body1">
            {point}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export default function CreateAdminUsersCard({ card, adminUsers }: Props) {
  const { admins, rowErrors, addAdmin, missingGroups, existingAdmins, entraLicence, roleTarget, usePim, setUsePim, access, steps, running, canRun, run, reset, error } = adminUsers;
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(() => admins[0]?.key ?? null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);
  const incomplete = admins.filter((a) => rowErrors[a.key]).length;
  const groupSummary = error ? "Couldn't read Entra" : !missingGroups ? "Checking..." : `${missingGroups.length} to create · ${ADMIN_GROUPS.length - missingGroups.length} existing`;
  const toggle = (key: string) => setOpenKey(openKey === key ? null : key);

  return (
    <Card title={CREATE_ADMIN_USERS_TITLE} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />
        {
          // {consentRequired && ( // Deprecated: the access check's Grant consent covers these scopes; kept for reference.
          //   <WarningNotice message="ZenInstaller needs your consent to manage Entra groups, users and directory roles.">
          //     <Button size="small" variant="outlined" onClick={() => void requestConsent()} sx={{ alignSelf: "flex-start" }}>
          //       Grant permissions
          //     </Button>
          //   </WarningNotice>
          // )}
        }
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography color="text.muted">Is Entra Privileged Identity Management (PIM) available?</Typography>
          <LicenceOption
            control={<Checkbox size="small" checked={usePim} onChange={(e) => setUsePim(e.target.checked)} />}
            option={PIM_OPTION}
            licence={entraLicence}
            selected={usePim}
            running={running}
          />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography variant="sectionLabel">Security groups</Typography>
            <Typography color="text.muted">{groupSummary}</Typography>
          </Box>
          {ADMIN_GROUPS.map((g) => (
            <SecurityGroupRow
              key={g.name}
              group={g}
              missingGroups={missingGroups}
              roleTarget={roleTarget}
              usePim={usePim}
              open={openGroup === g.name}
              onToggle={() => setOpenGroup(openGroup === g.name ? null : g.name)}
            />
          ))}
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography variant="sectionLabel">User accounts</Typography>
            <Typography color="text.muted">
              {admins.length} to add ·{" "}
              <Box component="span" sx={incomplete ? { color: "error.main" } : undefined}>
                {incomplete} incomplete
              </Box>
              {existingAdmins?.length ? ` · ${existingAdmins.length} existing` : ""}
            </Typography>
          </Box>
          {existingAdmins?.map((x) => (
            <ExistingAdminRow key={x.user.id} admin={x} open={openKey === x.user.id} onToggle={() => toggle(x.user.id)} />
          ))}
          {admins.map((a, index) => (
            <AdminUserRow
              key={a.key}
              adminUsers={adminUsers}
              admin={a}
              index={index}
              open={openKey === a.key}
              onToggle={() => toggle(a.key)}
              editing={editKey === a.key}
              onEditToggle={() => setEditKey(editKey === a.key ? null : a.key)}
            />
          ))}
          <Box sx={box}>
            <ButtonBase onClick={() => setOpenKey(addAdmin())} disabled={running} disableRipple sx={header}>
              <Box sx={circle}>
                <AddIcon sx={{ typography: "body2" }} />
              </Box>
              <Typography color="text.secondary" sx={{ fontWeight: 700 }}>
                Add user
              </Typography>
            </ButtonBase>
          </Box>
        </Box>

        {error && <ErrorText>Couldn't read the groups and admins from Entra: {error}</ErrorText>}

        {steps.length === 0 ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Button variant="contained" onClick={() => void run()} disabled={!canRun}>
              {admins.length ? "Create groups and admin accounts" : "Create groups"}
            </Button>
            {access.status === "error" && (
              <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ErrorOutlineIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "error.main" }} />
                <Typography color="error.main">Insufficient permissions to continue</Typography>
              </Box>
            )}
            {admins.length === 0 && (
              <Box role="note" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <InfoOutlinedIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "info.main" }} />
                <Typography color="text.secondary">No users. Running the card only creates the groups.</Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {running && <StatusText>Running...</StatusText>}
            <ProcessRetryNotice started />
            {!running && (
              <Button size="small" onClick={reset} sx={{ alignSelf: "flex-start", mt: 0.5, color: "text.muted", "&:hover": { color: "primary.main" } }}>
                ↩ Start over
              </Button>
            )}
          </Box>
        )}
        {(access.status === "warning" || access.status === "error") && (
          <Prerequisites id="create-admin-users-prerequisites" open={prerequisitesOpen} onToggle={() => setPrerequisitesOpen((open) => !open)}>
            <AzureAccessCheck access={access} resourceAccess errorStyle />
          </Prerequisites>
        )}
      </Box>
    </Card>
  );
}
