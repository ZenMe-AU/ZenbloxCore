/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Typography } from "@mui/material";

type Props = {
  children: ReactNode;
};

export default function Caption({ children }: Props) {
  return (
    <Typography component="span" variant="caption" color="text.secondary">
      {children}
    </Typography>
  );
}