/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { Link } from "@mui/material";

type Props = {
  href: string;
  label: string;
  children: ReactNode;
};

export default function ExternalLink({ href, label, children }: Props) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in new tab)`}>
      {children}
    </Link>
  );
}