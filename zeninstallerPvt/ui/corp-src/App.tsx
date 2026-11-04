/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, LinearProgress, Link, Typography } from "@mui/material";
import { groupSx } from "./config/cardLayout";
import { useCards, type CardModule } from "./hooks/useCards";
import { useUrlRestoreStatus } from "./session";
import SessionProvider from "./session/SessionProvider";
import CardsProvider from "./components/CardsProvider";

import Header from "./components/Header";
import Footer from "./components/Footer";
import RestoreToast from "./components/RestoreToast";
import CardIntro from "./components/CardIntro";
import ExternalLink from "./components/ExternalLink";

import { withAITracking } from "@microsoft/applicationinsights-react-js";
import { reactPlugin } from "./monitor/applicationInsights";

// ─── App ──────────────────────────────────────────────────────────────────────

// Every card folder with an index.ts, in its order: adding or removing a folder adds or removes its card.
const CARDS = Object.entries(import.meta.glob<{ default: CardModule }>("./cards/*/index.ts", { eager: true }))
  .map(([path, card]) => ({ path, ...card.default }))
  .sort((a, b) => a.order - b.order);

function Dashboard() {
  const { faces, cardProps, openCard } = useCards();
  const urlRestore = useUrlRestoreStatus();

  const progressCards = faces.filter((face) => !face.hideFromProgress).map((face) => ({ ...face, chrome: cardProps(face.cardId) }));
  const completedCount = progressCards.filter((item) => item.done).length;
  const nextStep = progressCards.find((item) => !item.done && !item.chrome.locked && !item.chrome.unavailable && item.chrome.status !== "loading");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Box sx={{ minHeight: "100vh" }}>
        <Link className="visually-hidden skip-link" href="#main-content">
          Skip to main content
        </Link>
        <Header />

        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{ maxWidth: "var(--card-w-expanded)", mx: "auto", px: { xs: 2, sm: 4 }, py: { xs: 3, sm: 5 } }}
        >
          {/* Intro */}
          <Box
            id="installer-intro"
            sx={{
              bgcolor: "background.paper",
              borderRadius: (theme) => theme.palette.card.radius,
              border: "1px solid",
              borderColor: "divider",
              px: { xs: 2, sm: 3 },
              py: 2.5,
              boxShadow: (theme) => theme.palette.card.shadow,
            }}
          >
            <CardIntro variant="body1" sx={{ lineHeight: 1.7, mb: 1 }}>
              ZenInstaller helps you set up cloud resources for your organisation. Before you start, prepare:
            </CardIntro>
            <Box component="ol" sx={{ m: 0, pl: 3, color: "text.secondary" }}>
              <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                A personal email address.
              </Typography>
              <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                A GitHub account with permission to create a repository in the account or organisation that will own it.
              </Typography>
              <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                An organisation name and domain. You can register the domain with{" "}
                <ExternalLink href="https://www.godaddy.com/" label="GoDaddy">
                  GoDaddy
                </ExternalLink>
                {" "}or another provider.
              </Typography>
            </Box>
            <CardIntro variant="body1" sx={{ lineHeight: 1.7, mt: 1, mb: 0 }}>
              Complete the cards below in any order — each shows what it needs before it can run.
            </CardIntro>
          </Box>

          <Box sx={groupSx}>
            <Box component="section" aria-label="Deployment setup progress" sx={{ ...groupSx, mt: 3 }}>
              <Box sx={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr", alignItems: "center", gap: 0.5, mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography component="h2" variant="sectionLabel">Deployment setup progress</Typography>
                  <Button
                    size="small"
                    variant="text"
                    disabled={!nextStep}
                    onClick={() => nextStep && openCard(nextStep.cardId)}
                    sx={{ flexShrink: 0 }}
                  >
                    {nextStep ? `Next step: ${nextStep.title}` : "All setup tasks complete"}
                  </Button>
                </Box>
                <LinearProgress
                  aria-label="Deployment setup progress"
                  variant="determinate"
                  value={progressCards.length ? (completedCount / progressCards.length) * 100 : 0}
                  sx={{ gridColumn: "1 / -1", height: 6, borderRadius: 3 }}
                />
              </Box>

              {CARDS.map(({ path, Component }) => (
                <Component key={path} />
              ))}
            </Box>
          </Box>
        </Box >
        <Footer />
      </Box >

      <RestoreToast loading={urlRestore.restoring} warnings={urlRestore.warnings} onDismiss={urlRestore.dismissWarnings} />
    </>
  );
}

function AppDashboard() {
  return (
    <SessionProvider>
      <CardsProvider>
        <Dashboard />
      </CardsProvider>
    </SessionProvider>
  );
}

export default withAITracking(reactPlugin, AppDashboard, "corpInstaller");
