/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Typography, type TypographyProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

type Props = {
  children: ReactNode;
  sx?: SxProps<Theme>;
  variant?: TypographyProps["variant"];
};

export default function CardIntro({ children, sx, variant = "body2" }: Props) {
  return (
    <Typography component="p" variant={variant} color="text.secondary" sx={sx}>
      {children}
    </Typography>
  );
}