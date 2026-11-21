/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, ButtonBase, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { AdminPair } from "../../api/azureGraph";
import type { WaitingAdmin } from "./logic";
import { Arrow } from "./RowParts";
import { box, head, header } from "./styles";

// An admin already in Entra, or, with a status, one a run created that Entra doesn't list yet; read-only.
export default function ExistingAdminRow({ admin: x, status, checking, open, onToggle }: { admin: AdminPair; status?: WaitingAdmin["status"]; checking?: boolean; open: boolean; onToggle: () => void }) {
  return (
    <Box sx={{ ...box, backgroundColor: "action.hover" }}>
      <ButtonBase aria-expanded={open} aria-controls={`existing-admin-${x.user.id}`} disableRipple onClick={onToggle} sx={header}>
        <Typography data-sensitive="true" color="text.secondary" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          {x.user.displayName}
        </Typography>
        <Typography data-sensitive="true" color="text.secondary" noWrap>
          {x.user.userPrincipalName}
        </Typography>
        {status ? (
          <Chip size="small" variant="outlined" color={status === "preparing" ? "info" : "warning"} label={status === "preparing" ? "Preparing" : checking ? "Checking..." : "Not listed yet"} />
        ) : (
          <Chip size="small" variant="outlined" label="Exists" sx={{ color: "text.secondary" }} />
        )}
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
