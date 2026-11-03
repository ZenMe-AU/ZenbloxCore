/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, CircularProgress, IconButton, InputAdornment, MenuItem, TextField, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew"; //Todo: check why this import could not be found or why it is missing
import Visibility from "@mui/icons-material/Visibility"; //Todo: check why this import could not be found or why it is missing
import VisibilityOff from "@mui/icons-material/VisibilityOff"; //Todo: check why this import could not be found or why it is missing
import WarningAmberIcon from "@mui/icons-material/WarningAmber"; //Todo: check why this import could not be found or why it is missing
import Card from "../../components/Card";
import ExternalLink from "../../components/ExternalLink";
import ViewLink from "../../components/ViewLink";
import { getAwsConsoleUrl } from "./consoleUrls";
import { CLOUD_DOCS } from "./docsConfig";
import { warningMessageIconSx } from "../../config/styles";
import type { UseAwsLoginCard } from "./useAwsLoginCard";
import type { CardChrome } from "../../types";

type Props = {
  card: CardChrome;
  awsLogin: UseAwsLoginCard;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary">
      Sign in with your AWS access key in this browser. We never send your long-term AWS access key or secret key to our servers; only short-term AWS session
      credentials are kept in this tab until they expire.
      <>
        <br />
        You will need to copy the credentials from AWS after&nbsp;
        <ExternalLink href={CLOUD_DOCS.aws.bootstrapCredentials} label="AWS setup guide">
          following the AWS set-up guide
          <OpenInNewIcon aria-hidden="true" sx={{ typography: "caption" }} />
        </ExternalLink>
        <br />
        If you do not have an AWS account yet, {" "}
        <ExternalLink href={CLOUD_DOCS.aws.createAccount} label="Create an AWS account">
          Create an AWS account
          <OpenInNewIcon aria-hidden="true" sx={{ typography: "caption" }} />
        </ExternalLink>
        . AWS may ask for payment details during signup.
      </>
    </Typography>
  );
}

function Action() {
  return <ViewLink href={getAwsConsoleUrl()} />;
}

export default function AwsLoginCard({ card, awsLogin }: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const {
    accessKeyId,
    setAccessKeyId,
    secretAccessKey,
    setSecretAccessKey,
    account,
    mfaDevices,
    selectedMfaSerial,
    setSelectedMfaSerial,
    mfaTokenCode,
    setMfaTokenCode,
    needsMfa,
    fidoOnly,
    done,
    loggingIn,
    signInError,
    canSignIn,
    login,
    logout,
  } = awsLogin;
  const usableDevices = mfaDevices.filter((d) => d.usable);

  return (
    <Card title="AWS login" action={<Action />} lockedIntro={<Intro />} {...card}>
      <Box
        component="form"
        // Gives the browser's password manager a real submit to detect, so it can offer to save the key pair.
        onSubmit={(e) => {
          e.preventDefault();
          if (canSignIn && !loggingIn) login();
        }}
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Intro />

        {!done && (
          <>
            <Box>
              <Typography variant="body2" color="text.muted" sx={{ mb: 1.5, lineHeight: 1.6 }}>
                Use an IAM user allowed to create identity providers and roles. Generate access keys from Security credentials; they are exchanged for short-term
                session credentials. After the role is created, deactivate and delete these access keys.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <TextField
                  size="small"
                  label="Access Key ID"
                  name="username"
                  autoComplete="username"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="AKIA..."
                  disabled={!!account || loggingIn || card.locked}
                  sx={{ maxWidth: 340 }}
                  className="corpTechnicalInput"
                />
                <TextField
                  size="small"
                  label="Secret Access Key"
                  type={showSecret ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  disabled={!!account || loggingIn || card.locked}
                  sx={{ maxWidth: 340 }}
                  className="corpTechnicalInput"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showSecret ? "Hide AWS secret access key" : "Show AWS secret access key"}
                          size="small"
                          type="button"
                          onClick={() => setShowSecret((v) => !v)}
                          edge="end"
                          tabIndex={-1}
                        >
                          {showSecret ? <VisibilityOff sx={{ typography: "caption" }} /> : <Visibility sx={{ typography: "caption" }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            </Box>
          </>
        )}

        {account && (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography color="text.secondary">
              {done ? "Signed in as " : "Authenticating as "}
              <Box component="span" sx={{ color: done ? "success.main" : undefined, fontWeight: 600 }}>
                {account.username}
              </Box>
              <Box component="span" sx={{ typography: "technical" }}>
                {" "}
                ({account.accountId})
              </Box>
            </Typography>
            <Button
              size="small"
              variant="contained"
              color="error"
              onClick={logout}
              sx={{ minWidth: 0, py: 0.25 }}
            >
              Sign out
            </Button>
          </Box>
        )}

        {needsMfa && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {usableDevices.length > 1 && (
              <TextField
                select
                size="small"
                label="MFA device"
                value={selectedMfaSerial ?? ""}
                onChange={(e) => setSelectedMfaSerial(e.target.value)}
                helperText="Pick the device you have on hand"
                sx={{ maxWidth: 280 }}
              >
                {usableDevices.map((d) => (
                  <MenuItem key={d.serialNumber} value={d.serialNumber}>
                    {d.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              size="small"
              label="MFA code"
              value={mfaTokenCode}
              onChange={(e) => setMfaTokenCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSignIn && !loggingIn) login();
              }}
              placeholder="123456"
              helperText={usableDevices.length > 1 ? "Code from the selected device" : `Code from ${usableDevices[0]?.name ?? "your MFA device"}`}
              className="corpTechnicalInput"
              inputProps={{ maxLength: 6 }}
              sx={{ maxWidth: 160 }}
            />
          </Box>
        )}

        {fidoOnly && (
          <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, maxWidth: 420 }}>
            <WarningAmberIcon aria-hidden="true" sx={{ ...warningMessageIconSx, color: "warning.main" }} />
            <Typography color="warning.dark" sx={{ lineHeight: 1.6 }}>
              Your only MFA is a security key (FIDO), which AWS can't use for CLI/API sign-in. We'll continue without MFA — if your account requires MFA,
              register an authenticator-app (TOTP) device or use access keys that don't enforce MFA.
            </Typography>
          </Box>
        )}

        {!done && (
          <Box>
            <Button
              variant="contained"
              type="submit"
              disabled={card.locked || !canSignIn || loggingIn}
              aria-busy={loggingIn}
              startIcon={loggingIn ? <CircularProgress aria-label="Signing in to AWS" size={14} sx={{ color: "inherit" }} /> : undefined}
              sx={{
                alignSelf: "flex-start",
                py: 1,
                px: 2.5,
                boxShadow: (theme) => `0 2px 8px ${theme.palette.primary.main}33`,
                "&:hover": {
                  boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}44`,
                },
              }}
            >
              {loggingIn ? "Signing in..." : needsMfa ? "Verify & sign in" : "Sign in"}
            </Button>
          </Box>
        )}

        {signInError && <Typography color="error.main" role="alert">{signInError}</Typography>}
      </Box>
    </Card>
  );
}
