import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import type { CardStatus } from "../types";
import type { useAzureAccessPass } from "../hooks/useAccessPass";
import StepWrapper from "../components/StepWrapper";
import AccessPassLoginCard from "./AccessPassLoginDetails";
import { logEvent } from "../monitor/telemetry";

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
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
};

export default function AccessPassLogin({ status, expanded, onToggle, disabled, ...auth }: Props) {
  const subtitle = auth.azureAccount ? (auth.needsTenantId ? "Enter tenant ID to continue" : "Azure login ready") : "Sign in and provide tenant ID";

  return (
    <StepWrapper
      title="Azure Login"
      subtitle={subtitle}
      status={status}
      expanded={expanded}
      onToggle={() => {
        logEvent("toggleAccessPassLoginCard", { parentId: "XXXXXXX" });
        onToggle();
      }}
      action={status === "complete" ? <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#16a34a" }} /> : null}
    >
      <AccessPassLoginCard {...auth} disabled={disabled} />
    </StepWrapper>
  );
}
