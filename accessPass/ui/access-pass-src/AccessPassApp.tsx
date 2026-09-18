import { useState, useEffect} from "react";
import { Box, Typography } from "@mui/material";
import { useAzureAccessPass } from "./hooks/useAccessPass";
import Connector from "./components/Connector";
import NavBar from "./components/NavBar";
import AccessPassLogin from "./cards/AccessPassLogin";
import AzureAccessPass from "./cards/AccessPass";
import { logPageView } from "./monitor/telemetry";

// ─── App ──────────────────────────────────────────────────────────────────────

export default function AccessPassApp() {
  useEffect(() => {
    try {
      logPageView("AccessPassApp");
    } catch {}
  },[]);

  const azureAccessPass = useAzureAccessPass({
    githubAccount: null,
    githubRepo: "",
    validEnvs: [],
  });

  
  const [loginExpanded, setLoginExpanded] = useState(true);
  const [accessPassExpanded, setAccessPassExpanded] = useState(true);
  const loginReady = !!azureAccessPass.azureAccount && !azureAccessPass.needsTenantId;
  const loginStatus = loginReady ? "complete" : "loading";
  const accessPassStatus = azureAccessPass.result ? "complete" : loginReady ? "loading" : "idle";

  return (
    <Box sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <NavBar title="Access Pass" siblingPage={{ label: "ZenInstaller", href: "/" }} />

      <Box sx={{ maxWidth: 860, mx: "auto", px: 4, py: 5 }}>
        <Box
          sx={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            px: 3,
            py: 2.5,
            mb: 3,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <Typography sx={{ fontSize: "0.85rem", color: "#475569", lineHeight: 1.7, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            The ZenInstaller is used to deploy Zenblox to your environment. It requires a Github repository in your own account, an Azure, and AWS
            subscription in your name. ZenInstaller will guide you through each step of the process starting from nothing.
          </Typography>
        </Box>

        <Connector>
          <AccessPassLogin
            {...azureAccessPass}
            status={loginStatus}
            expanded={loginExpanded}
            onToggle={() => setLoginExpanded((p) => !p)}
            disabled={false}
          />

          <AzureAccessPass
            {...azureAccessPass}
            status={accessPassStatus}
            expanded={accessPassExpanded}
            onToggle={() => setAccessPassExpanded((p) => !p)}
            disabled={!loginReady}
            locked={!loginReady}
            validEnvs={[]}
            onComplete={() => {}}
          />
        </Connector>
      </Box>
    </Box>
  );
}
