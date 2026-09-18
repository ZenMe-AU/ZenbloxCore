import { Box, Collapse, IconButton, Typography } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { CardStatus } from "../../access-pass-src/types";

type Props = {
  title: string;
  subtitle?: string;
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
};

export default function StepWrapper({ title, subtitle, status, expanded, onToggle, disabled = false, children, action }: Props) {
  return (
    <Box
      sx={{
        mb: "28px",
        flex: 1,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
        border: "1px solid",
        borderColor:
          status === "complete"
            ? "#bbf7d0"
            : status === "error"
              ? "#fecaca"
              : status === "warning"
                ? "#fed7aa"
                : status === "skipped"
                  ? "#f1f5f9"
                  : "#e2e8f0",
        borderRadius: "10px",
        background: "#ffffff",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "border-color 0.2s",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2.5,
          py: 1.75,
          cursor: "pointer",
          "&:hover": { background: "#fafafa" },
        }}
        onClick={onToggle}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "0.85rem",
              fontWeight: 600,
              color: disabled ? "#94a3b8" : status === "skipped" ? "#94a3b8" : "#0f172a",
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </Typography>
          {subtitle && <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", mt: 0.25 }}>{subtitle}</Typography>}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          {action}
          <IconButton size="small" sx={{ color: "#cbd5e1", "&:hover": { color: "#94a3b8" } }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <Box sx={{ borderTop: "1px solid #f1f5f9", px: 2.5, py: 2.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}
