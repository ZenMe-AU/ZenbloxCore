/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

// A labelled value with a copy button. `masked` hides the value but still copies the real one.
export default function CopyRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const displayValue = masked ? "*".repeat(Math.max(value.length, 12)) : value;
  const copy = async () => {
    let copied = false;
    try {
      if (typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) copied = copyWithLegacyCommand(value);

    setCopyState(copied ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 1500);
  };
  const copied = copyState === "copied";
  const copyLabel = copied ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy";
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
        aria-label={`${copyLabel} ${label}`}
        size="small"
        onClick={copy}
        sx={{ minWidth: 0, p: 0.5, color: "text.muted", "&:hover": { color: "primary.main" } }}
      >
        <ContentCopyIcon aria-hidden="true" sx={{ typography: "caption" }} />
        <Typography component="span" aria-live={copyState === "failed" ? "assertive" : "polite"} sx={{ ml: 0.5 }}>{copyLabel}</Typography>
      </Button>
    </Box>
  );
}

function copyWithLegacyCommand(value: string): boolean {
  if (typeof document.execCommand !== "function") return false;

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.setAttribute("aria-hidden", "true");
  input.setAttribute("data-sensitive", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  const previousActiveElement = document.activeElement;
  document.body.appendChild(input);
  input.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    input.remove();
    if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus();
  }
  return copied;
}
