/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from "@mui/material";

export default function Footer() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <Box component="footer" sx={{ maxWidth: "var(--card-w-expanded)", mx: "auto", px: { xs: 2, sm: 4 }, pb: { xs: 3, sm: 5 } }}>
      <Box
        sx={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          px: { xs: 2, sm: 3 },
          py: 2.5,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          // Matches the intro panel's body2 text (CardIntro): 0.875rem / 1.5.
          "& .MuiTypography-root, & .MuiLink-root, & .MuiButton-root": {
            fontSize: "0.875rem",
            lineHeight: 1.5,
          },
        }}
      >
        <Typography component="h2" variant="h2" sx={{ mb: 2 }}>
          Help &amp; information
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 2 }}>
          <Box>
            <Typography component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Keyboard shortcuts
            </Typography>
            <Button variant="outlined" size="small" onClick={() => setShortcutsOpen(true)}>
              View keyboard shortcuts
            </Button>
          </Box>
          <Box>
            <Typography component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Contact
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contact information coming soon.
            </Typography>
          </Box>
          <Box>
            <Typography component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Policies
            </Typography>
            <Link href="/docs/Privacy_Policy">Privacy policy</Link>
            <Typography variant="body2" color="text.secondary">
              Terms of use coming soon.
            </Typography>
          </Box>
          <Box>
            <Typography component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Support
            </Typography>
            <Link href="/docs/">Support documentation</Link>
          </Box>
        </Box>
      </Box>

      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} aria-labelledby="keyboard-shortcuts-title">
        <DialogTitle id="keyboard-shortcuts-title">Keyboard shortcuts</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Keyboard shortcuts will be listed here when they are available.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShortcutsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
