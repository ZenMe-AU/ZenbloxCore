/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Typography } from "@mui/material";

type Props = {
  children: ReactNode;
};

export default function StatusText({ children }: Props) {
  return (
    <Typography component="p" variant="body2" color="text.secondary" role="status" aria-live="polite">
      {children}
    </Typography>
  );
}