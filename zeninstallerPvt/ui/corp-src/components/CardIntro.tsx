/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

type Props = {
  children: ReactNode;
  sx?: SxProps<Theme>;
};

export default function CardIntro({ children, sx }: Props) {
  return (
    <Typography component="p" variant="body2" color="text.secondary" sx={sx}>
      {children}
    </Typography>
  );
}