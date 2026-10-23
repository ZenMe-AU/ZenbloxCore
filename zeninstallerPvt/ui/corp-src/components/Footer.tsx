/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from "@mui/material";

const DOCS_BASE = import.meta.env.VITE_DOCS_URL ?? "";

export default function Footer() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches("input, textarea, select"))) return;
      setShortcutsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Box component="footer" sx={{ maxWidth: "var(--card-w-expanded)", mx: "auto", px: { xs: 2, sm: 4 }, pb: { xs: 3, sm: 5 } }}>
      <Box
        sx={{
          bgcolor: "background.paper",
          borderRadius: (theme) => theme.palette.card.radius,
          border: "1px solid",
          borderColor: "divider",
          px: { xs: 2, sm: 3 },
          py: 2.5,
          boxShadow: (theme) => theme.palette.card.shadow,
          // Matches the intro panel's body2 text (CardIntro): 0.875rem / 1.5.
          "& .MuiTypography-root, & .MuiLink-root, & .MuiButton-root": { typography: "body2" },
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
            <Button variant="outlined" size="small" onClick={() => setShortcutsOpen(true)} aria-haspopup="dialog">
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
            <Link href={`${DOCS_BASE}/Privacy_Policy`}>Privacy policy</Link>
            <Typography variant="body2" color="text.secondary">
              Terms of use coming soon.
            </Typography>
          </Box>
          <Box>
            <Typography component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Support
            </Typography>
            <Link href={`${DOCS_BASE}/`}>Support documentation</Link>
          </Box>
        </Box>
      </Box>

      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} aria-labelledby="keyboard-shortcuts-title">
        <DialogTitle id="keyboard-shortcuts-title">Keyboard shortcuts</DialogTitle>
        <DialogContent>
          <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", columnGap: 2, rowGap: 1, m: 0 }}>
            <Typography component="dt" sx={{ fontWeight: 600 }}><Box component="kbd">?</Box></Typography>
            <Typography component="dd" sx={{ m: 0 }}>Open this shortcuts dialog, unless focus is in an editable field.</Typography>
            <Typography component="dt" sx={{ fontWeight: 600 }}><Box component="kbd">Tab / Shift+Tab</Box></Typography>
            <Typography component="dd" sx={{ m: 0 }}>Move focus forward or backward between controls.</Typography>
            <Typography component="dt" sx={{ fontWeight: 600 }}><Box component="kbd">Enter / Space</Box></Typography>
            <Typography component="dd" sx={{ m: 0 }}>Activate the focused button, including card toggles.</Typography>
            <Typography component="dt" sx={{ fontWeight: 600 }}><Box component="kbd">Enter</Box></Typography>
            <Typography component="dd" sx={{ m: 0 }}>Follow a focused link or run the focused field's supported action.</Typography>
            <Typography component="dt" sx={{ fontWeight: 600 }}><Box component="kbd">Escape</Box></Typography>
            <Typography component="dd" sx={{ m: 0 }}>Close this dialog.</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Text fields and selects keep their normal browser keyboard behavior.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShortcutsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
