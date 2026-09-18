import { Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { useAzureAccessPass } from "../hooks/useAccessPass";
import { CLOUD_DOCS } from "../config/docsConfig";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

type Props = Pick<
  ReturnType<typeof useAzureAccessPass>,
  | "azureAccount"
  | "loggingIn"
  | "loginError"
  | "needsTenantId"
  | "manualTenantId"
  | "setManualTenantId"
  | "tenantIdError"
  | "confirmTenantId"
  | "login"
  | "logout"
  | "changeTenant"
> & {
  disabled: boolean;
};

export default function AccessPassLoginCard({
  azureAccount,
  loggingIn,
  loginError,
  needsTenantId,
  manualTenantId,
  setManualTenantId,
  tenantIdError,
  confirmTenantId,
  login,
  logout,
  changeTenant,
  disabled,
}: Props) {
  return (
    <>
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

      {azureAccount && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
              Signed in as{" "}
              <Box component="span" data-sensitive="true" data-id="txtAzureUsername" sx={{ fontWeight: 600, ...mono }}>
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

          {needsTenantId && (
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
              <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>Enter Tenant ID</Typography>
              <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono }}>
                Find this in Entra ID - Overview - Tenant ID.
              </Typography>
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexDirection: "column" }}>
                <TextField
                  size="small"
                  value={manualTenantId}
                  onChange={(e) => setManualTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  onKeyDown={(e) => e.key === "Enter" && confirmTenantId()}
                  inputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                  error={!!tenantIdError}
                  helperText={tenantIdError}
                  sx={{ minWidth: 420 }}
                />
                <Button
                  variant="contained"
                  data-id="btnConfirmTenant"
                  size="small"
                  onClick={confirmTenantId}
                  sx={{ background: "#d97706", textTransform: "none", ...mono, fontSize: "0.78rem", "&:hover": { background: "#b45309" } }}
                >
                  Confirm tenant
                </Button>
              </Box>
            </Box>
          )}

          <Button
            size="small"
            onClick={changeTenant}
            sx={{ alignSelf: "flex-start", minWidth: 0, fontSize: "0.68rem", color: "#94a3b8", textTransform: "none", ...mono, py: 0, "&:hover": { color: "#2563eb" } }}
          >
            Change tenant ID
          </Button>
        </Box>
      )}
    </>
  );
}