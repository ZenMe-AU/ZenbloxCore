/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, TextField } from "@mui/material";
import Card from "../../components/Card";
import { GITHUB_SIGNUP_URL } from "../../logic/github";
import { useCards } from "../../hooks/useCards";
import { useGithubSession } from "../../session";
import { useGithubSignupCard } from "./useGithubSignupCard";

function Intro() {
  return (
    <>
      Need a GitHub account? Enter your email to open GitHub signup in a new tab with your email prefilled.
      Complete the remaining signup steps yourself on GitHub, then return here to sign in.
    </>
  );
}

export default function GithubSignupCard() {
  const { login } = useGithubSession();
  const { openCard } = useCards();
  const signup = useGithubSignupCard(login.done);
  const onOpenLogin = () => openCard("github_login");
  return (
    <Card face={{ ...signup, hideFromProgress: true }} intro={<Intro />}>
      <Box sx={{ mb: 2 }}>
      </Box>
      <Box
        component="form"
        action={GITHUB_SIGNUP_URL}
        method="get"
        target="_blank"
        rel="noopener noreferrer"
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <TextField
          label="Email address"
          name="user_email"
          type="email"
          autoComplete="email"
          required
          fullWidth
          size="small"
          value={signup.email}
          onChange={(event) => signup.setEmail(event.target.value)}
          helperText="Your email is sent to GitHub only when you continue. No account is created automatically."
        />
        <Button type="submit" variant="contained" size="small">
          Continue to GitHub signup
        </Button>
      </Box>
      <Button onClick={onOpenLogin} size="small" sx={{ mt: 1 }}>
        Already have an account? Sign in to GitHub
      </Button>
    </Card>
  );
}