/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import Card from "../../components/Card";
import ViewLink from "../../components/ViewLink";
import { getGithubUserUrl, GITHUB_LOGIN_URL } from "../../logic/github";
import RefreshButton from "../../components/RefreshButton";
import { useRefreshIndicator } from "../../hooks/util/useRefreshIndicator";
import type { CardChrome } from "../../types";
import { type UseGithubLoginCard } from "./useGithubLoginCard";

type Props = {
  card: CardChrome;
  auth: UseGithubLoginCard;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox.
    </Typography>
  );
}

function Action({ login }: { login?: string }) {
  return <ViewLink href={login ? getGithubUserUrl(login) : GITHUB_LOGIN_URL} />;
}

export default function GithubLoginCard({ card, auth }: Props) {
  const {
    loggingIn: authLoading,
    account: user,
    login: onLogin,
    logout: onLogout,
    mode,
    setMode,
    backendAvailable,
    token: pat,
    setToken: setPat,
    refresh: onRefresh,
    redirecting,
  } = auth;
  const signingIn = redirecting === "login";
  const [patError, setPatError] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { refreshResult, markClicked } = useRefreshIndicator(refreshing);

  const handleRefresh = async () => {
    markClicked();
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleModeChange = (_: unknown, next: "backend" | "direct" | null) => {
    if (!next) return;
    setMode(next);
  };

  const handlePatSubmit = () => {
    const trimmed = pat.trim();
    if (!trimmed.startsWith("ghp_") && !trimmed.startsWith("github_pat_")) {
      setPatError("Must be a GitHub PAT (ghp_… or github_pat_…)");
      return;
    }
    setPatError("");
    setPat(trimmed);
    onLogin();
  };

  return (
    <Card title="GitHub login" action={<Action login={user?.login} />} lockedIntro={<Intro />} {...card}>
      <Box>
        <Box sx={{ mb: 2 }}>
          <Intro />
        </Box>

        {/* Mode toggle — hidden once logged in, and when PAT is the only mode there is nothing to pick */}
        {!user && backendAvailable && (
          <Box sx={{ mb: 2 }}>
            <Typography color="text.muted" sx={{ mb: 1 }}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                Backend
              </Box>{" "}
              signs you in through GitHub's OAuth flow and routes GitHub API requests through ZenInstaller's backend; your access token stays in this browser session
              and is sent with those requests, but is not stored on the server.{" "}
              <Box component="span" sx={{ fontWeight: 600 }}>
                Direct (PAT)
              </Box>{" "}
              skips the backend entirely — paste your own Personal Access Token and the browser talks to GitHub directly.
            </Typography>
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={handleModeChange}
              size="small"
              sx={{ "& .MuiToggleButton-root": { px: 1.5, py: 0.4 } }}
            >
              <ToggleButton value="backend">Backend</ToggleButton>
              <ToggleButton value="direct">Direct (PAT)</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {authLoading ? (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
            <CircularProgress aria-label={signingIn ? "Signing you in" : "Verifying access"} size={16} sx={{ color: "text.disabled" }} />
            <Typography color="text.muted">{signingIn ? "Signing you in..." : "Verifying access..."}</Typography>
          </Box>
        ) : !user ? (
          mode === "direct" ? (
            <Box
              component="form"
              // Gives the browser's password manager a real submit to detect, so it can offer to save the token.
              onSubmit={(e) => {
                e.preventDefault();
                handlePatSubmit();
              }}
              sx={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 400 }}
            >
              {/* Password managers key an entry on a username; the token alone gives them nothing to name it by. */}
              <input type="text" name="username" autoComplete="username" value="github-pat" readOnly hidden />
              <TextField
                size="small"
                type={showPat ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="ghp_… or github_pat_…"
                value={pat}
                onChange={(e) => {
                  setPat(e.target.value);
                  setPatError("");
                }}
                error={!!patError}
                helperText={patError || "Personal Access Token with repo + workflow scopes"}
                aria-label="GitHub Personal Access Token"
                className="corpTechnicalInput"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      {pat && (
                        <IconButton
                          aria-label="Clear GitHub Personal Access Token"
                          size="small"
                          onClick={() => {
                            setPat("");
                            setPatError("");
                          }}
                          tabIndex={-1}
                        >
                          <ClearIcon sx={{ typography: "caption", color: "text.muted" }} />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => setShowPat((v) => !v)}
                        edge="end"
                        tabIndex={-1}
                        aria-label={showPat ? "Hide token" : "Show token"}
                      >
                        {showPat ? <VisibilityOffIcon sx={{ typography: "caption", color: "text.muted" }} /> : <VisibilityIcon sx={{ typography: "caption", color: "text.muted" }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                FormHelperTextProps={{ role: patError ? "alert" : undefined }}
              />
              <Button
                variant="contained"
                type="submit"
                disabled={!pat?.trim() || signingIn}
                startIcon={signingIn ? <CircularProgress size={14} sx={{ color: "text.disabled" }} /> : undefined}
                sx={{
                  alignSelf: "flex-start",
                  py: 0.75,
                  px: 2,
                }}
              >
                {signingIn ? "Connecting..." : "Connect with PAT"}
              </Button>
            </Box>
          ) : (
            <Button
              variant="contained"
              onClick={onLogin}
              disabled={signingIn}
              startIcon={signingIn ? <CircularProgress size={14} sx={{ color: "text.disabled" }} /> : undefined}
              sx={{
                py: 1,
                px: 2.5,
                boxShadow: (theme) => `0 2px 8px ${theme.palette.primary.main}33`,
                "&:hover": {
                  boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}44`,
                },
                "&.Mui-disabled": { boxShadow: "none" },
              }}
            >
              {signingIn ? "Connecting..." : "Sign in with GitHub"}
            </Button>
          )
        ) : (
          <Box role="status" aria-live="polite">
            <Typography color="text.muted" sx={{ mb: 2 }}>
              Authenticated as{" "}
              <Box component="span" data-sensitive="true" sx={{ color: "success.main", fontWeight: 600 }}>
                {user.login}
              </Box>
              {mode === "direct" && (
                <Box component="span" sx={{ color: "text.muted" }}>
                  {" "}
                  · PAT mode
                </Box>
              )}
              . You can sign out and connect a different account below.
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                color="error"
                onClick={onLogout}
                sx={{
                  py: 0.5,
                }}
              >
                Sign out
              </Button>
              {/* PAT mode re-verifies the same token, so refreshing only means anything for a backend session. */}
              {mode === "backend" && <RefreshButton busy={refreshing} result={refreshResult} onClick={handleRefresh} />}
            </Box>
          </Box>
        )}
      </Box>
    </Card>
  );
}
