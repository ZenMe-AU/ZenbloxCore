/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Typography } from "@mui/material";

type Props = {
  children: ReactNode;
};

export default function ErrorText({ children }: Props) {
  return (
    <Typography component="p" variant="body2" color="error.main" role="alert">
      {children}
    </Typography>
  );
}