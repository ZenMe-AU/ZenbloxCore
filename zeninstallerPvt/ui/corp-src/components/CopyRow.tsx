/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

// Muted until hovered, with a caption-sized icon, in both the labelled and the icon-only button.
const copyButtonColorSx = { color: "text.muted", "&:hover": { color: "primary.main" } } as const;
const copyTextButtonSx = { ...copyButtonColorSx, minWidth: 0, p: 0.5 } as const;
const copyIconSx = { typography: "caption" } as const;
const copyTextSx = { ml: 0.5 } as const;

// A copy button on its own; `label` names what it copies for screen readers, `text` is what it shows, `iconOnly` shows it as a tooltip instead.
export function CopyButton({ label, value, text = "Copy", iconOnly = false }: { label: string; value: string; text?: string; iconOnly?: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
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
  const copyLabel = copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : text;
  if (iconOnly) {
    return (
      <Tooltip title={copyLabel}>
        <IconButton aria-label={`${copyLabel} ${label}`} size="small" onClick={copy} sx={copyButtonColorSx}>
          <ContentCopyIcon aria-hidden="true" sx={copyIconSx} />
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <Button
      aria-label={`${copyLabel} ${label}`}
      size="small"
      onClick={copy}
      sx={copyTextButtonSx}
    >
      <ContentCopyIcon aria-hidden="true" sx={copyIconSx} />
      <Typography component="span" aria-live={copyState === "failed" ? "assertive" : "polite"} sx={copyTextSx}>{copyLabel}</Typography>
    </Button>
  );
}

// A labelled value with a copy button. `masked` hides the value but still copies the real one.
export default function CopyRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const displayValue = masked ? "*".repeat(Math.max(value.length, 12)) : value;
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
      <CopyButton label={label} value={value} />
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
