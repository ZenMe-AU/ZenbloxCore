import React from "react";
import { Box } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveIcon from "@mui/icons-material/Remove";
import type { CardStatus } from "../types";
import { PIPELINE_LINE_COLOR } from "../config/pipelineConfig";

const CIRCLE_COLOR: Record<CardStatus, string> = {
  idle: "#cbd5e1",
  loading: "#60a5fa",
  complete: "#22c55e",
  warning: "#f97316",
  error: "#ef4444",
  skipped: "#94a3b8",
};

type StepProps = { status: CardStatus; disabled?: boolean };

function StepSpine({
  status,
  disabled,
  hasPrev,
  hasNext,
  prevStatus,
}: {
  status: CardStatus;
  disabled?: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  prevStatus?: CardStatus;
}) {
  const idleColor = CIRCLE_COLOR.idle;
  const circleColor = disabled ? idleColor : CIRCLE_COLOR[status];
  const circleFill = status === "complete" && !disabled ? circleColor : "#ffffff";
  const incomingColor = PIPELINE_LINE_COLOR[prevStatus ?? status];
  const lineColor = PIPELINE_LINE_COLOR[status];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        alignSelf: "stretch",
        width: 32,
        flexShrink: 0,
      }}
    >
      <Box sx={{ width: 2, height: 14, background: hasPrev ? incomingColor : "transparent", flexShrink: 0 }} />

      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `2px solid ${circleColor}`,
          background: circleFill,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.2s",
        }}
      >
        {status === "complete" ? (
          <CheckCircleIcon sx={{ fontSize: 16, color: disabled ? idleColor : "#ffffff" }} />
        ) : status === "warning" ? (
          <WarningAmberIcon sx={{ fontSize: 14, color: disabled ? idleColor : "#f97316" }} />
        ) : status === "error" ? (
          <ErrorOutlineIcon sx={{ fontSize: 14, color: disabled ? idleColor : "#ef4444" }} />
        ) : status === "skipped" ? (
          <RemoveIcon sx={{ fontSize: 14, color: disabled ? idleColor : "#94a3b8" }} />
        ) : status === "loading" ? (
          <RadioButtonUncheckedIcon sx={{ fontSize: 12, color: circleColor }} />
        ) : null}
      </Box>

      <Box sx={{ flex: 1, width: 2, background: hasNext ? lineColor : "transparent" }} />
    </Box>
  );
}

export default function Connector({ children }: { children: React.ReactNode }) {
  const arr = React.Children.toArray(children);

  const stepIndices = arr.reduce<number[]>((acc, child, i) => {
    if (React.isValidElement(child) && child.props !== null && "status" in (child.props as object)) {
      acc.push(i);
    }
    return acc;
  }, []);

  return (
    <Box>
      {arr.map((child, i) => {
        const isStep = React.isValidElement(child) && child.props !== null && "status" in (child.props as object);

        if (!isStep) return <React.Fragment key={i}>{child}</React.Fragment>;

        const stepProps = (child as React.ReactElement<StepProps>).props;
        const stepRank = stepIndices.indexOf(i);
        const hasPrev = stepRank > 0;
        const hasNext = stepRank < stepIndices.length - 1;
        const prevStatus = hasPrev ? (arr[stepIndices[stepRank - 1]] as React.ReactElement<StepProps>).props.status : undefined;

        return (
          <React.Fragment key={i}>
            <Box sx={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 1.5 }}>
              <StepSpine status={stepProps.status} disabled={stepProps.disabled} hasPrev={hasPrev} hasNext={hasNext} prevStatus={prevStatus} />
              {child}
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
