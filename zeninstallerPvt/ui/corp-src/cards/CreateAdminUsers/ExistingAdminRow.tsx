/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, ButtonBase, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { AdminPair } from "../../api/azureGraph";
import type { CreatedAdmin } from "./logic";
import { Arrow } from "./RowParts";
import { box, head, header } from "./styles";

// An admin a run just created, until Entra lists them as existing; read-only.
export function WaitingAdminRow({ admin }: { admin: CreatedAdmin }) {
  return (
    <Box sx={{ ...box, backgroundColor: "action.hover" }}>
      <Box sx={{ ...header, display: "flex", alignItems: "center", "&:hover": undefined }}>
        <Typography data-sensitive="true" color="text.secondary" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          {admin.user.displayName}
        </Typography>
        <Typography data-sensitive="true" color="text.secondary" noWrap>
          {admin.user.userPrincipalName} · {admin.privileged.userPrincipalName}
        </Typography>
        <Chip size="small" variant="outlined" color="success" label="Created · waiting for Entra" />
      </Box>
    </Box>
  );
}

// An admin already in Entra; read-only.
export default function ExistingAdminRow({ admin: x, open, onToggle }: { admin: AdminPair; open: boolean; onToggle: () => void }) {
  return (
    <Box sx={{ ...box, backgroundColor: "action.hover" }}>
      <ButtonBase aria-expanded={open} aria-controls={`existing-admin-${x.user.id}`} disableRipple onClick={onToggle} sx={header}>
        <Typography data-sensitive="true" color="text.secondary" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          {x.user.displayName}
        </Typography>
        <Typography data-sensitive="true" color="text.secondary" noWrap>
          {x.user.userPrincipalName}
        </Typography>
        <Chip size="small" variant="outlined" label="Exists" sx={{ color: "text.secondary" }} />
        <Arrow open={open} />
      </ButtonBase>
      {open && (
        <Box id={`existing-admin-${x.user.id}`} sx={{ borderTop: "1px solid", borderColor: "divider", p: 1.5, overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 700, tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...head, width: 200 }}>Account</TableCell>
                <TableCell sx={head}>UPN</TableCell>
                <TableCell sx={head}>Display name</TableCell>
                <TableCell sx={head}>Manager</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(
                [
                  ["User account", x.user],
                  ["Privileged account", x.privileged],
                ] as const
              ).map(([account, u]) => (
                <TableRow key={account}>
                  <TableCell sx={{ color: "text.primary", whiteSpace: "nowrap" }}>{account}</TableCell>
                  <TableCell data-sensitive="true" sx={{ color: "text.secondary", overflowWrap: "anywhere" }}>{u.userPrincipalName}</TableCell>
                  <TableCell data-sensitive="true" sx={{ color: "text.secondary" }}>{u.displayName}</TableCell>
                  <TableCell data-sensitive="true" sx={{ color: "text.secondary" }}>{u.manager ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
