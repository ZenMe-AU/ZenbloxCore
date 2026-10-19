/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

// A labelled value with a copy button. `masked` hides the value but still copies the real one.
export default function CopyRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const [copied, setCopied] = useState(false);
  const displayValue = masked ? "*".repeat(Math.max(value.length, 12)) : value;
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
      <Typography variant="fieldLabel" sx={{ minWidth: 180 }}>{label}</Typography>
      <Typography
        data-sensitive="true"
        sx={{
          color: "text.primary",
          typography: "technical",
          ...(masked ? { flex: "0 0 auto" } : { flex: 1, wordBreak: "break-all" }),
        }}
      >
        {displayValue}
      </Typography>
      <Button
        aria-label={`${copied ? "Copied" : "Copy"} ${label}`}
        size="small"
        onClick={copy}
        sx={{ minWidth: 0, p: 0.5, color: "text.muted", "&:hover": { color: "primary.main" } }}
      >
        <ContentCopyIcon aria-hidden="true" sx={{ typography: "caption" }} />
        <Typography component="span" aria-live="polite" sx={{ ml: 0.5 }}>{copied ? "Copied" : "Copy"}</Typography>
      </Button>
    </Box>
  );
}
