/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Fragment } from "react";
import { Box, ButtonBase, Chip, Typography } from "@mui/material";
import { groupRoleLabel, type AdminGroup, type RoleTarget } from "./config";
import { Arrow } from "./RowParts";
import { box, header } from "./styles";

export default function SecurityGroupRow({ group: g, missingGroups, roleTarget, usePim, open, onToggle }: {
  group: AdminGroup;
  missingGroups: string[] | null;
  roleTarget: RoleTarget;
  usePim: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const toCreate = missingGroups?.includes(g.name);
  const exists = !!missingGroups && !toCreate; // Greyed out, but still opens.
  const summary = [
    ...(g.memberOf.length ? [`member of ${g.memberOf.join(", ")}`] : []),
    ...(g.roles.length ? [`${g.roles.length} role${g.roles.length > 1 ? "s" : ""}`] : []),
  ].join(" · ");
  const details: [string, string][] = [
    ["Description", g.description],
    ["Member of", g.memberOf.join(", ") || "—"],
    ["Roles", g.roles.map((role) => groupRoleLabel(g, role, roleTarget, usePim)).join(", ") || "—"],
    ["Role-assignable", g.roleAssignable && roleTarget === "group" ? "Yes" : "No"],
  ];
  return (
    <Box sx={exists ? { ...box, backgroundColor: "action.hover" } : box}>
      <ButtonBase aria-expanded={open} aria-controls={`admin-group-${g.name}`} disableRipple onClick={onToggle} sx={header}>
        <Typography color={exists ? "text.secondary" : "text.primary"} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          {g.name}
        </Typography>
        {summary && (
          <Typography color={exists ? "text.secondary" : "text.muted"} noWrap>
            {summary}
          </Typography>
        )}
        {missingGroups && <Chip size="small" variant="outlined" color={toCreate ? "primary" : "default"} label={toCreate ? "Create" : "Exists"} sx={exists ? { color: "text.secondary" } : undefined} />}
        <Arrow open={open} />
      </ButtonBase>
      {open && (
        <Box id={`admin-group-${g.name}`} sx={{ borderTop: "1px solid", borderColor: "divider", p: 1.5, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 3, rowGap: 0.5 }}>
          {details.map(([label, value]) => (
            <Fragment key={label}>
              <Typography color="text.muted">{label}</Typography>
              <Typography color="text.secondary">{value}</Typography>
            </Fragment>
          ))}
        </Box>
      )}
    </Box>
  );
}
