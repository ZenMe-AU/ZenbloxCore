import React from "react";
import { Box, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

export default function ProcessRetryNotice({ started }: { started: boolean }) {
  if (!started) return null;

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75 }} role="note">
      <InfoOutlinedIcon aria-hidden="true" sx={{ typography: "caption", color: "info.main", flexShrink: 0, mt: "2px" }} />
      <Typography variant="caption" color="text.secondary">
        If one or more steps fail, try running the process again.
      </Typography>
    </Box>
  );
}
