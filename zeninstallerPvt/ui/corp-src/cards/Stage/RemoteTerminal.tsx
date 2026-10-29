/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useColorScheme } from "@mui/material/styles";
import "@xterm/xterm/css/xterm.css";
import type { UseRemoteTerminal } from "./useRemoteTerminal";
import type { Cloud, TerminalStatus } from "../../logic/remoteTerminal";
import { stageLabel, TERMINAL_COLORS } from "../../config/remoteTerminal";
import type { TerminalColors } from "../../config/remoteTerminal";

const STATUS_COLOR: Record<TerminalStatus, keyof TerminalColors> = {
  idle: "muted",
  registering: "yellow",
  dispatching: "yellow",
  negotiating: "yellow",
  connecting: "yellow",
  connected: "green",
  reconnecting: "yellow",
  closed: "muted",
  error: "red",
};

const IN_PROGRESS: TerminalStatus[] = ["registering", "dispatching", "negotiating", "connecting", "reconnecting"];

const STATUS_TEXT: Record<TerminalStatus, string> = {
  idle: "Idle",
  registering: "Registering the session...",
  dispatching: "Starting the GitHub workflow...",
  negotiating: "Getting a relay token...",
  connecting: "Connecting to the relay...",
  connected: "Connected",
  reconnecting: "Lost the relay — reconnecting...",
  closed: "Session ended",
  error: "Error",
};

const darkBtnSx = (colors: TerminalColors) => ({
  background: colors.border,
  color: colors.text,
  border: `1px solid ${colors.surface}`,
  py: 0.4,
  px: 1.25,
  minWidth: 0,
  "&:hover": { background: colors.surface },
});

function StatusBar({ session, colors }: { session: UseRemoteTerminal; colors: TerminalColors }) {
  const waitingForRunner = session.status === "connected" && !session.runnerJoined;
  const text = waitingForRunner ? "Connected — waiting for the runner" : STATUS_TEXT[session.status];
  const dotColor = colors[waitingForRunner ? "yellow" : STATUS_COLOR[session.status]];
  const pulsing = waitingForRunner || IN_PROGRESS.includes(session.status);
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.5,
        py: 0.875,
        background: colors.header,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          background: dotColor,
          animation: pulsing ? "pulse 1.5s infinite" : "none",
          "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } },
        }}
      />
      <Typography sx={{ typography: "technicalBody", color: colors.text, fontWeight: 600 }}>{text}</Typography>
      {session.stage && (
        <Typography
          sx={{
            typography: "technicalBody",
            color: colors.accent,
            background: colors.border,
            px: 0.75,
            py: 0.15,
            borderRadius: "4px",
          }}
        >
          {stageLabel(session.stage)}
        </Typography>
      )}
      {session.sessionId && (
        <Typography sx={{ typography: "technicalBody", color: colors.muted, ml: "auto" }}>{session.sessionId.slice(0, 8)}</Typography>
      )}
      {/* Gone once the session is over — the panel stays, but there is nothing left to end. */}
      {session.status !== "closed" && session.status !== "idle" && (
            <Button aria-label="End terminal session" onClick={session.stop} size="small" sx={{ ...darkBtnSx(colors), ml: session.sessionId ? 0 : "auto" }}>
          End session
        </Button>
      )}
    </Box>
  );
}

const CLOUD_NAME: Record<Cloud, string> = { azure: "Azure", aws: "AWS" };

function DeviceCodePanel({ cloud, url, code, colors }: { cloud: Cloud; url: string; code?: string; colors: TerminalColors }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        background: colors.header,
        borderBottom: `1px solid ${colors.border}`,
        textAlign: "center",
      }}
    >
      <Typography sx={{ typography: "technicalBody", color: colors.accent, fontWeight: 600, mb: 1 }}>
        {cloud === "aws" ? "AWS Console Sign-In" : "Azure Device Code Login"}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, flexWrap: "wrap" }}>
        {code && (
          <>
            <Typography
              sx={{
                typography: "technicalBody",
                fontWeight: 700,
                letterSpacing: 0,
                color: colors.yellow,
                background: colors.border,
                px: 1.5,
                py: 0.5,
                borderRadius: "6px",
              }}
            >
              {code}
            </Typography>
            <Button aria-label="Copy sign-in code" onClick={handleCopy} size="small" sx={darkBtnSx(colors)}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </>
        )}
        <Button
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${cloud === "aws" ? "Open AWS sign-in" : "Open Microsoft device login"} (opens in new tab)`}
          size="small"
          endIcon={<OpenInNewIcon sx={{ typography: "caption" }} />}
          sx={{
            ...darkBtnSx(colors),
            background: colors.accent,
            color: colors.panel,
            borderColor: colors.accent,
            "&:hover": { background: colors.accentHover },
          }}
        >
          {cloud === "aws" ? "Open AWS Sign-In" : "Open Microsoft Device Login"}
        </Button>
      </Box>
      <Typography sx={{ typography: "technicalBody", color: colors.muted, mt: 1 }}>
        {cloud === "aws"
          ? "Sign in, then paste the authorization code it gives you into the terminal below."
          : "Enter the code on the Microsoft page — it cannot be pre-filled from the link."}
      </Typography>
    </Box>
  );
}

export default function RemoteTerminal({ session }: { session: UseRemoteTerminal }) {
  const { terminal, resize } = session;
  const { mode } = useColorScheme();
  const colors = TERMINAL_COLORS[mode === "dark" ? "dark" : "light"];
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !terminal) return;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(el);
    const refit = () => {
      fit.fit();
      resize(terminal.cols, terminal.rows);
    };
    refit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [terminal, resize]);

  if (!terminal) return null;

  return (
    <Box
      sx={{
        borderRadius: "8px",
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
        background: colors.panel,
      }}
    >
      <StatusBar session={session} colors={colors} />
      {session.deviceCode && <DeviceCodePanel cloud={session.deviceCode.cloud} url={session.deviceCode.url} code={session.deviceCode.code} colors={colors} />}
      {session.loggedIn.length > 0 && (
        <Typography
          role="status"
          aria-live="polite"
          sx={{
            typography: "technicalBody",
            color: colors.green,
            background: colors.successBg,
            borderBottom: `1px solid ${colors.green}`,
            px: 1.5,
            py: 0.875,
            textAlign: "center",
          }}
        >
          {session.loggedIn.map((c) => CLOUD_NAME[c]).join(" and ")} sign-in completed.
        </Typography>
      )}
      {session.error && (
        <Typography
          role="alert"
          aria-live="assertive"
          sx={{
            typography: "technicalBody",
            color: colors.red,
            px: 1.5,
            py: 0.75,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {session.error}
        </Typography>
      )}
      <Box ref={containerRef} sx={{ height: "18rem", p: 0.75 }} />
    </Box>
  );
}
