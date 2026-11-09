/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { warningMessageIconSx } from "../config/styles";

type Props = {
  message: ReactNode;
  children?: ReactNode; // Extra content below the message, e.g. details or an action.
};

export default function WarningNotice({ message, children }: Props) {
  return (
    <Box
      sx={{
        backgroundColor: "background.default",
        border: "1px solid",
        borderColor: "warning.main",
        borderRadius: 1,
        px: 2,
        py: 1.25,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
      role="status"
      aria-live="polite"
    >
      <Box sx={{ display: "flex", gap: 1 }}>
        <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
        <Typography color="warning.dark">{message}</Typography>
      </Box>
      {children}
    </Box>
  );
}
