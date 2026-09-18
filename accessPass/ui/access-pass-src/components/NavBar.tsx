import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useState } from "react";
import type { RepoOption, User } from "../types";

type Props = {
  authLoading?: boolean;
  user?: User | null;
  selectedRepo?: RepoOption | null;
  title?: string;
  siblingPage?: { label: string; href: string };
};

export default function NavBar({ authLoading = false, user = null, selectedRepo = null, title, siblingPage }: Props) {
  const [copied, setCopied] = useState(false);

  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      px: 4, py: 1.75, background: "#ffffff", borderBottom: "1px solid #e2e8f0",
      position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: "7px", background: "linear-gradient(135deg, #2563eb, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "0.7rem", fontWeight: 800, color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}>
          ZB
        </Box>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", letterSpacing: "-0.01em" }}>
          {title ?? "ZenInstaller Setup Central Corp Environment"}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        {siblingPage && (
          <Button
            size="small"
            component="a"
            href={siblingPage.href}
            sx={{
              fontSize: "0.72rem",
              textTransform: "none",
              color: "#64748b",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { color: "#0f172a" },
            }}
          >
            {siblingPage.label}
          </Button>
        )}
        {authLoading ? (
          <CircularProgress size={16} sx={{ color: "#cbd5e1" }} />
        ) : user ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
            <Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>
              {user.login}
            </Typography>
            {selectedRepo && !selectedRepo.isNew && (
              <Button size="small" variant="outlined"
                startIcon={copied ? <CheckIcon sx={{ fontSize: 12 }} /> : <ContentCopyIcon sx={{ fontSize: 12 }} />}
                onClick={() => navigator.clipboard.writeText(window.location.href).then(() => {
                  setCopied(true); setTimeout(() => setCopied(false), 2000);
                })}
                sx={{ borderColor: copied ? "#bbf7d0" : "#e2e8f0", color: copied ? "#16a34a" : "#94a3b8",
                  fontSize: "0.72rem", textTransform: "none", fontFamily: "'IBM Plex Mono', monospace", py: 0.5,
                  transition: "color 0.15s, border-color 0.15s", "&:hover": { borderColor: "#cbd5e1", color: "#475569" } }}>
                {copied ? "Copied!" : "Copy link"}
              </Button>
            )}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
