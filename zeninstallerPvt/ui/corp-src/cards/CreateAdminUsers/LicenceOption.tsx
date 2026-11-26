/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactElement } from "react";
import { Box, Chip, FormControlLabel, Typography } from "@mui/material";
import type { EntraLicence } from "../../api/azureGraph";
import { LICENCE_LABEL, licenceAllows, type LicenceState } from "./config";
import { box } from "./styles";

// A bordered option, greyed out until the licence allows it.
export default function LicenceOption({ value, control, option, licence, selected, running }: {
  value?: string;
  control: ReactElement;
  option: { label: string; description: string; needs: EntraLicence };
  licence: LicenceState;
  selected: boolean;
  running: boolean;
}) {
  const allowed = licenceAllows(option.needs, licence);
  const known = licence !== null && licence !== "unknown";
  return (
    <FormControlLabel
      value={value}
      disabled={running || !allowed}
      control={control}
      sx={{ ...box, m: 0, pr: 1.5, py: 0.75, alignItems: "flex-start", borderColor: selected ? "primary.main" : "divider", backgroundColor: allowed ? "background.paper" : "action.hover" }}
      label={
        <Box sx={{ pt: 0.75 }}>
          <Typography color={allowed ? "text.primary" : "text.disabled"} sx={{ fontWeight: 700 }}>
            {option.label}
            {option.needs !== "none" && (
              <Chip
                size="small"
                variant="outlined"
                color={allowed ? "primary" : "default"}
                label={known && !allowed ? `Needs ${LICENCE_LABEL[option.needs]}` : LICENCE_LABEL[option.needs]}
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
          <Typography color={allowed ? "text.secondary" : "text.disabled"}>{option.description}</Typography>
        </Box>
      }
    />
  );
}
