import type { ReactNode } from "react";
import { Box, Tooltip } from "@mui/material";

export default function InfoTip({ label, description, sensitive = false, children }: {
  label: string;
  description: string;
  sensitive?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip describeChild title={<span data-sensitive={sensitive || undefined}>{description}</span>} placement="top" arrow>
      <Box component="span" role="img" tabIndex={0} aria-label={label}
        sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, minHeight: 24, flexShrink: 0, cursor: "help",
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>
        {children}
      </Box>
    </Tooltip>
  );
}