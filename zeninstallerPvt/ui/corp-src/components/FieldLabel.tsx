/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { FormLabel } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

type Props = {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
  sx?: SxProps<Theme>;
};

export default function FieldLabel({ htmlFor, children, required = false, sx }: Props) {
  return (
    <FormLabel htmlFor={htmlFor} required={required} sx={{ display: "block", mb: 0.5, ...sx }}>
      {children}
    </FormLabel>
  );
}