import { useState } from "react";
import { Autocomplete, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { useAzureAccessPass, SetupStep } from "../hooks/useAccessPass";
import { CLOUD_DOCS } from "../config/docsConfig";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const labelSx = { fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", ...mono };

function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#22c55e" }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444" }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} sx={{ color: "#2563eb" }} />
    ) : (
      <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontSize: "0.78rem", color: step.status === "error" ? "#ef4444" : "#475569", ...mono }}>{step.label}</Typography>
        {step.detail && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.25 }}>{step.detail}</Typography>}
      </Box>
    </Box>
  );
}

function CopyRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const [copied, setCopied] = useState(false);
  const displayValue = masked ? "*".repeat(Math.max(value.length, 12)) : value;
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
      <Typography sx={{ ...labelSx, minWidth: 180 }}>{label}</Typography>
      <Typography sx={{ fontSize: "0.78rem", color: "#1e293b", ...mono, flex: 1, wordBreak: "break-all" }}>{displayValue}</Typography>
      <Button size="small" onClick={copy} sx={{ minWidth: 0, p: 0.5, color: "#94a3b8", "&:hover": { color: "#2563eb" } }}>
        <ContentCopyIcon sx={{ fontSize: 13 }} />
        <Typography sx={{ fontSize: "0.65rem", ml: 0.5, ...mono }}>{copied ? "Copied" : "Copy"}</Typography>
      </Button>
    </Box>
  );
}

type Props = ReturnType<typeof useAzureAccessPass> & {
  disabled: boolean;
  validEnvs: readonly string[];
  onComplete: (done: boolean) => void;
};

export default function AzureAccessPassCard({
  azureAccount,
  appName,
  steps,
  result,
  running,
  loggingIn,
  consentFailed,
  loginError,
  subsError,
  managerUsers,
  selectedManagerUserId,
  setSelectedManagerUserId,
  managerUsersLoading,
  managerUsersError,
  login,
  logout,
  reset,
  run,
  disabled,
}: Props) {
  // Determine if the current result corresponds to the selected Entra user, so we can show the access pass value only for that user.
  const showingSelectedUserPass = !!result && !!selectedManagerUserId && result.targetUserId === selectedManagerUserId;
  const hydratedSelectedUserSteps: SetupStep[] =
    showingSelectedUserPass && steps.length === 0
      ? [{ id: "tap", label: "Create Temporary Access Pass", status: "done", detail: "Temporary Access Pass created" }]
      : steps;
  const hasFinishedOrErroredStep = hydratedSelectedUserSteps.some((s) => s.status === "done" || s.status === "error");
  const showingSelectedUserSteps = hydratedSelectedUserSteps.length > 0 && (running || showingSelectedUserPass || hasFinishedOrErroredStep);
  const selectedUserRunSucceeded =
    showingSelectedUserPass && hydratedSelectedUserSteps.length > 0 && hydratedSelectedUserSteps.every((s) => s.status === "done");
  const shouldShowTryAgain = !running && showingSelectedUserSteps && !selectedUserRunSucceeded;

  return (
    <>
      {/* ── Not signed in ── */}
      {!azureAccount && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {loggingIn ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: "#2563eb" }} />
              <Typography sx={{ fontSize: "0.72rem", color: "#64748b", ...mono }}>Checking session...</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", ...mono }}>Don't have an account?</Typography>
                <Box
                  component="a"
                  href={CLOUD_DOCS.azure.createAccount}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "#64748b", textDecoration: "none", "&:hover": { color: "#2563eb" } }}
                >
                  <Typography sx={{ fontSize: "0.72rem", ...mono }}>How to Create a Free Azure Account</Typography>
                  <OpenInNewIcon sx={{ fontSize: 12 }} />
                </Box>
              </Box>
              <Button
                variant="contained"
                onClick={login}
                disabled={disabled}
                sx={{
                  alignSelf: "flex-start",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  textTransform: "none",
                  ...mono,
                  fontSize: "0.85rem",
                  py: 1,
                  px: 2.5,
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px #2563eb33",
                  "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
                  "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                }}
              >
                Connect Azure
              </Button>
            </>
          )}
          {loginError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{loginError}</Typography>}
        </Box>
      )}

      {/* ── Signed in ── */}
      {azureAccount && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Account info */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
              Signed in as{" "}
              <Box component="span" data-id="txtAzureAccount" sx={{ fontWeight: 600, ...mono }}>
                {azureAccount.username}
              </Box>
            </Typography>
            <Button
              size="small"
              onClick={logout}
              sx={{ minWidth: 0, fontSize: "0.68rem", color: "#94a3b8", textTransform: "none", ...mono, py: 0.25, "&:hover": { color: "#ef4444" } }}
            >
              Sign out
            </Button>
          </Box>

          {/* Entra user selector */}
          {
            <Box
              sx={{
                background: "#fef9c3",
                border: "1px solid #fde047",
                borderRadius: "8px",
                px: 2,
                py: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>Personal Microsoft account detected</Typography>
                <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono, mt: 0.25 }}>
                  Select a user from Entra who is managed by your signed-in account.
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexDirection: "column" }}>
                {/* <Typography sx={{ fontSize: "0.68rem", color: "#854d0e", ...mono }}>
                  {`Direct reports: ${managerUsers.length} | Loading: ${managerUsersLoading ? "yes" : "no"}`}
                </Typography> */}
                <Autocomplete
                  options={managerUsers}
                  value={managerUsers.find((u) => u.id === selectedManagerUserId) ?? null}
                  onChange={(_, v) => setSelectedManagerUserId(v?.id ?? "")}
                  loading={managerUsersLoading}
                  sx={{ minWidth: 480 }}
                  // Show both name and UPN to help distinguish users with similar display names.
                  getOptionLabel={(option) => `${option.displayName}${option.userPrincipalName ? ` (${option.userPrincipalName})` : ""}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      placeholder={managerUsersLoading ? "Loading users..." : "Select Entra user"}
                      inputProps={{ ...params.inputProps, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                      error={!!managerUsersError}
                      helperText={managerUsersError}
                    />
                  )}
                />
              </Box>
            </Box>
          }

          {subsError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{subsError}</Typography>}

          {/* Config */}
          {!showingSelectedUserSteps && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Button
                variant="contained"
                onClick={() => {
                  reset();
                  void run();
                }}
                disabled={disabled || !selectedManagerUserId}
                sx={{
                  alignSelf: "flex-start",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  textTransform: "none",
                  ...mono,
                  fontSize: "0.85rem",
                  py: 0.85,
                  px: 2.5,
                  borderRadius: "8px",
                  boxShadow: "0 2px 6px #2563eb33",
                  "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)" },
                  "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                }}
              >
                Create Access Pass
              </Button>
            </Box>
          )}

          {/* Progress steps */}
          {showingSelectedUserSteps && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid #e2e8f0", pl: 1.5 }}>
              {hydratedSelectedUserSteps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
              {running && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.5 }}>Running...</Typography>}
              {shouldShowTryAgain && (
                <Button
                  size="small"
                  onClick={reset}
                  sx={{
                    alignSelf: "flex-start",
                    mt: 0.5,
                    textTransform: "none",
                    ...mono,
                    fontSize: "0.72rem",
                    color: "#64748b",
                    "&:hover": { color: "#2563eb" },
                  }}
                >
                  ↩ Try again
                </Button>
              )}
            </Box>
          )}

          {/* Consent warning */}
          {consentFailed && (
            <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
              <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>⚠ Admin consent failed — grant manually</Typography>
              <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono, mt: 0.5 }}>
                Entra ID → App registrations → {appName} → API permissions → Grant admin consent for [tenant]
              </Typography>
            </Box>
          )}

          {/* Output */}
          {showingSelectedUserPass && (
            <Box sx={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", px: 2, py: 1.5 }}>
              <Typography sx={{ ...labelSx, mb: 1, color: "#15803d" }}>Temporary Access Pass</Typography>
              <CopyRow label="New Temporary Access Pass:" value={result.accessPassValue} masked />
            </Box>
          )}

          {result && !showingSelectedUserPass && (
            <Typography sx={{ fontSize: "0.72rem", color: "#64748b", ...mono }}>No access pass value is currently shown for this selected user.</Typography>
          )}
        </Box>
      )}
    </>
  );
}
