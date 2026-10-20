/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { Button, Card, CardContent, Typography, Box, Container, CircularProgress } from "@mui/material";
import Logout from "@mui/icons-material/Logout";
import { useAuth, type Auth } from "../hooks/useAuth";
import { useAnchor, type Anchor } from "../hooks/useAnchor";

// Component: Displays login page with different content for authenticated and unauthenticated users
export default function LoginPage() {
  const { hasAnchor, goBack } = useAnchor();
  const { account, logout } = useAuth();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "url('/bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        px: 2, // padding for small screens
      }}
    >
      <Card
        sx={{
          maxWidth: 350,
          width: "100%",
          mx: "auto",
          borderRadius: 6,
          boxShadow: 10,
        }}
      >
        <CardContent sx={{ textAlign: "center", pt: 4 }}>
          <UnauthenticatedSection />
          <AuthenticatedSection account={account} logout={logout} hasAnchor={hasAnchor} goBack={goBack} />
        </CardContent>
      </Card>
    </Box>
  );
}

// Separate components for authenticated and unauthenticated sections below
function UnauthenticatedSection() {
  return (
    <UnauthenticatedTemplate>
      <Box
        sx={{
          position: "relative",
          display: "inline-block",
          textAlign: "center",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          bgcolor: "rgba(255, 255, 255, 0.8)",
          zIndex: 2,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 2,
        }}
      >
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="body1">Waiting for Microsoft authentication</Typography>
      </Box>
    </UnauthenticatedTemplate>
  );
}

function AuthenticatedSection({ account, logout, hasAnchor, goBack }: Pick<Auth, "account" | "logout"> & Pick<Anchor, "hasAnchor" | "goBack">) {
  return (
    <AuthenticatedTemplate>
      <Container sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
          You are signed in as
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, wordBreak: "break-word" }}>
          {account?.idTokenClaims?.preferred_username || ""}{" "}
        </Typography>
      </Container>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {hasAnchor && (
          <Button
            variant="outlined"
            sx={{
              borderRadius: 20,
              textTransform: "none",
              fontWeight: "bold",
              fontSize: "0.95rem",
            }}
            onClick={goBack}
          >
            Return to Previous Page
          </Button>
        )}

        <Button
          variant="outlined"
          color="error"
          sx={{
            borderRadius: 20,
            textTransform: "none",
            fontWeight: "bold",
            fontSize: "0.95rem",
          }}
          onClick={logout}
          startIcon={<Logout />}
        >
          Sign Out
        </Button>
      </Box>
    </AuthenticatedTemplate>
  );
}
