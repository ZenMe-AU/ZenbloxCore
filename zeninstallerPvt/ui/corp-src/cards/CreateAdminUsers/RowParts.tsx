/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

export function Arrow({ open }: { open: boolean }) {
  return <KeyboardArrowDownIcon aria-hidden="true" sx={{ ml: "auto", color: "text.muted", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />;
}
